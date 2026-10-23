// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
// Opt-in browser probe: production capture code, synthetic local page and extension.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';

const profile = await mkdtemp(resolve(tmpdir(), 'context-selection-security-'));
const extension = resolve(profile, 'extension');
const token = '11111111-2222-4333-8444-555555555555';
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end(`<section id="chosen">CHOSEN_CONTENT</section><section id="outside">OUTSIDE_CONTENT</section><script>
    const original = document.querySelectorAll.bind(document);
    document.querySelectorAll = selector => selector === '*' ? original('#outside') : original(selector);
    new MutationObserver(records => {
      for (const record of records) {
        const name = record.attributeName;
        if (name?.startsWith('data-cac-selection-') && !document.getElementById('outside').hasAttribute(name))
          document.getElementById('outside').setAttribute(name, '');
      }
    }).observe(document.documentElement, { attributes: true, subtree: true });
  </script>`);
});
let child;
let socket;
const pending = new Map();
let nextId = 0;
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function poll(read) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await read(); if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Probe target did not become available.');
}
try {
  await mkdir(extension);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const pageUrl = `http://127.0.0.1:${server.address().port}/`;
  const entry = resolve(profile, 'probe.ts');
  await writeFile(entry, `import { captureChromeAccessibilityTree } from ${JSON.stringify(resolve('src/adapters/chrome/capture.ts'))};
    globalThis.probeCapture = async () => {
      const [tab] = await chrome.tabs.query({ url: ${JSON.stringify(pageUrl)} });
      await chrome.scripting.executeScript({ target: {tabId: tab.id}, world: 'ISOLATED', func: token => {
        const root = document.getElementById('chosen');
        globalThis.__pageAsContextPicker = { token, root: () => root };
        root.setAttribute('data-cac-selection-' + token, '');
      }, args: [${JSON.stringify(token)}] });
      return captureChromeAccessibilityTree(tab.id, ${JSON.stringify(token)});
    };`);
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry, name: 'SelectionProbe', formats: ['iife'], fileName: () => 'probe.js' }, outDir: extension, emptyOutDir: false } });
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Selection security probe', version: '1.0',
    permissions: ['debugger', 'scripting', 'tabs'], host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'probe.js' } }));
  const binary = process.env.CHROME_BINARY ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  child = spawn(binary, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--enable-unsafe-extension-debugging',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Browser startup timed out.')), 20_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stderr.on('data', data => { output += data; const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const response = JSON.parse(data); const request = pending.get(response.id); if (!request) return;
    pending.delete(response.id); clearTimeout(request.timer);
    if (response.error) request.reject(new Error(JSON.stringify(response.error))); else request.resolve(response.result);
  });
  const { id } = await send('Extensions.loadUnpacked', { path: extension });
  await send('Target.createTarget', { url: pageUrl });
  const worker = await poll(async () => (await send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`)));
  const { sessionId } = await send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  await send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  await poll(async () => (await send('Runtime.evaluate', { expression: 'typeof globalThis.probeCapture === "function"', returnByValue: true }, sessionId)).result?.value);
  const response = await send('Runtime.evaluate', { expression: 'globalThis.probeCapture()', awaitPromise: true, returnByValue: true }, sessionId);
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  const result = response.result.value;
  assert.equal(result?.ok, true, JSON.stringify(result));
  const output = JSON.stringify(result.tree);
  assert.ok(output.includes('CHOSEN_CONTENT'), output);
  assert.ok(!output.includes('OUTSIDE_CONTENT'), output);
  console.log('Chrome: retained selection captured; cloned marker and hostile page lookup ignored.');
} finally {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Probe closed.')); }
  pending.clear(); socket?.close();
  if (child && child.exitCode === null) await new Promise(resolve => {
    child.once('exit', resolve); child.kill(); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref();
  });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
