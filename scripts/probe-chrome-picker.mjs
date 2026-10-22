// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
// Opt-in browser probe: production capture code, synthetic local page and extension.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, cp, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';

const liveW3Schools = process.argv.includes('--w3schools');
const profile = await mkdtemp(resolve(tmpdir(), 'context-selection-security-'));
const extension = resolve(profile, 'extension');
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><title>Picker regression</title><main><article><section><p id="chosen">CHOSEN_CONTENT</p></section></article><p id="outside">OUTSIDE_CONTENT</p></main>');
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
  const pageUrl = liveW3Schools ? 'https://www.w3schools.com/html/tryit.asp?filename=tryhtml_youtubeiframe' : `http://127.0.0.1:${server.address().port}/`;
  await cp(resolve('.output/chrome-mv3'), extension, { recursive: true });
  const entry = resolve(profile, 'probe.ts');
  await writeFile(entry, `import { createPickerCoordinator } from ${JSON.stringify(resolve('src/element-picker-session.ts'))};
    import { installDiagnostics } from ${JSON.stringify(resolve('src/diagnostics/background.ts'))};
    installDiagnostics();
    const picker = createPickerCoordinator();
    globalThis.probeStart = () => picker.start({ compression: 'compact', format: 'semantic-text', redactSensitiveData: true });`);
  await build({ configFile: false, logLevel: 'silent', resolve: { alias: { '@': resolve('.') } }, define: { 'import.meta.env.BROWSER': JSON.stringify('chrome') }, build: { lib: { entry, name: 'PickerProbe', formats: ['iife'], fileName: () => 'probe.js' }, outDir: extension, emptyOutDir: false } });
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  manifest.permissions.push('tabs'); manifest.host_permissions = [liveW3Schools ? 'https://www.w3schools.com/*' : 'http://127.0.0.1/*'];
  manifest.background.service_worker = 'probe.js';
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
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
  const { targetId: pageId } = await send('Target.createTarget', { url: pageUrl });
  const worker = await poll(async () => (await send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`)));
  const { sessionId } = await send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  const { sessionId: pageSession } = await send('Target.attachToTarget', { targetId: pageId, flatten: true });
  await poll(async () => (await send('Runtime.evaluate', { expression: 'typeof globalThis.probeStart === "function"', returnByValue: true }, sessionId)).result?.value);
  await send('Runtime.enable', {}, pageSession);
  await poll(async () => (await send('Runtime.evaluate', { expression: 'document.readyState === "complete"', returnByValue: true }, pageSession)).result?.value);
  const { targetId: diagnosticsId } = await send('Target.createTarget', { url: `chrome-extension://${id}/data-controls.html` });
  const { sessionId: diagnosticsSession } = await send('Target.attachToTarget', { targetId: diagnosticsId, flatten: true });
  await poll(async () => (await send('Runtime.evaluate', { expression: 'document.readyState === "complete"', returnByValue: true }, diagnosticsSession)).result?.value);
  const requestHistory = async (action, extra = {}) => {
    const response = await send('Runtime.evaluate', { expression: `chrome.runtime.sendMessage(${JSON.stringify({ type: 'diagnostics', action, ...extra })})`, awaitPromise: true, returnByValue: true }, diagnosticsSession);
    assert.ok(!response.exceptionDetails, JSON.stringify(response));
    assert.equal(response.result?.value?.ok, true, JSON.stringify(response));
    return response.result.value;
  };
  assert.deepEqual((await requestHistory('history-read')).history.settings, { enabled: false, retentionDays: 60, maxMiB: 10 });
  await requestHistory('history-settings', { settings: { enabled: true, retentionDays: 365, maxMiB: 50 } });
  await send('Target.activateTarget', { targetId: pageId });
  const click = async selector => {
    const { root } = await send('DOM.getDocument', { depth: -1, pierce: true }, pageSession);
    const stack = [root]; let node;
    while (stack.length) {
      const current = stack.pop();
      const attrs = current.attributes ?? [];
      const target = liveW3Schools && selector === 'chosen' ? attrs.some((name, index) => index % 2 === 0 && name === 'id' && attrs[index + 1] === 'iframeResult') : attrs.some((name, index) => index % 2 === 0 && name === 'id' && attrs[index + 1] === selector);
      if (target) { node = current; break; }
      stack.push(...current.children ?? [], ...current.shadowRoots ?? []);
    }
    assert.ok(node, `Missing picker node ${selector}`);
    const { model } = await send('DOM.getBoxModel', { nodeId: node.nodeId }, pageSession);
    const q = model.content; const x = (q[0] + q[2]) / 2; const y = (q[1] + q[5]) / 2;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, pageSession);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, pageSession);
  };
  for (const parents of [0, 2]) {
    const started = await send('Runtime.evaluate', { expression: 'globalThis.probeStart()', awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(started.result?.value?.ok, true, JSON.stringify(started));
    await click('chosen');
    for (let index = 0; index < parents; index++) await click('parent');
    await click('copy');
    const status = await poll(async () => {
      const { root } = await send('DOM.getDocument', { depth: -1, pierce: true }, pageSession);
      const stack = [root]; let status; let enabled = false;
      while (stack.length) {
        const node = stack.pop(); const attrs = node.attributes ?? [];
        const idIndex = attrs.indexOf('id'); const name = idIndex >= 0 ? attrs[idIndex + 1] : '';
        if (name === 'status') status = node;
        if (name === 'copy') enabled = !attrs.includes('disabled');
        stack.push(...node.children ?? [], ...node.shadowRoots ?? []);
      }
      if (!enabled || !status) return;
      const text = node => (node.nodeValue ?? '') + (node.children ?? []).map(text).join('');
      return text(status);
    });
    assert.ok(status.includes('Copied selected context.'), status);
    await click('preview');
    const preview = await poll(async () => (await send('Target.getTargets')).targetInfos.find(target => target.url.startsWith(`chrome-extension://${id}/preview.html`)));
    const { sessionId: previewSession } = await send('Target.attachToTarget', { targetId: preview.targetId, flatten: true });
    const content = await poll(async () => (await send('Runtime.evaluate', { expression: 'document.querySelector("#context")?.value', returnByValue: true }, previewSession)).result?.value);
    if (!liveW3Schools) { assert.ok(content.includes('CHOSEN_CONTENT')); assert.ok(!content.includes('OUTSIDE_CONTENT')); } else assert.ok(content.length > 100);
    await send('Target.closeTarget', { targetId: preview.targetId });
    await send('Target.activateTarget', { targetId: pageId });
    console.log(`Chrome picker: Copy and Preview passed after ${parents} parent selections.`);
  }
  const history = (await requestHistory('history-read')).history;
  assert.equal(history.count, 4);
  assert.ok(history.entries.every(entry => entry.scope === 'selection' && entry.selectedElementTag && entry.sourceUrl === pageUrl && entry.browser && entry.capturedAt));
  const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  assert.ok(history.entries.every(entry => entry.extensionVersion === version && entry.exportSettings === '/5/d'));
  const json = (await requestHistory('history-export', { destination: 'copy' })).json;
  assert.ok(!json.includes('CHOSEN_CONTENT') && !json.includes('OUTSIDE_CONTENT'));
  assert.ok(!(await requestHistory('read', { includeLog: true })).report.events?.some(event => JSON.stringify(event).includes(pageUrl)));
  await requestHistory('history-clear');
  assert.equal((await requestHistory('history-read')).history.count, 0);
  console.log('Chrome capture history: opt-in, metadata-only persistence, export and clear passed.');
  for (const settings of [
    { allowlistEnabled: false, allowed: [], blocked: [new URL(pageUrl).origin + '/'] },
    { allowlistEnabled: true, allowed: [], blocked: [] },
  ]) {
    await requestHistory('sources-save', { settings });
    assert.deepEqual((await requestHistory('sources-read')).settings, { ...settings, blocked: settings.blocked.map(site => site.replace(/\/$/u, '')) });
    const blocked = await send('Runtime.evaluate', { expression: 'globalThis.probeStart()', awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(blocked.result?.value?.ok, false);
    assert.ok(blocked.result?.value?.error?.message.includes('personal site settings'), JSON.stringify(blocked));
  }
  await requestHistory('sources-save', { settings: { allowlistEnabled: false, allowed: [], blocked: [] } });
  console.log('Chrome personal sources: persisted deny list and enabled-empty allowlist block picker capture.');

} finally {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Probe closed.')); }
  pending.clear(); socket?.close();
  if (child && child.exitCode === null) await new Promise(resolve => {
    child.once('exit', resolve); child.kill(); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref();
  });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
