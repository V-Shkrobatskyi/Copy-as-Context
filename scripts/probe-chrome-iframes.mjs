/** Opt-in native CDP probe. Uses isolated synthetic pages, not the user's browser profile. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const { values } = parseArgs({ options: { 'chrome-binary': { type: 'string' }, extension: { type: 'boolean', default: false } } });
const binary = values['chrome-binary'] ?? process.env.CHROME_BINARY ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const fixture = await readFile('tests/manual/chrome-iframe-quality.html', 'utf8');
const source = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { createFrameCapturer } = await source.ssrLoadModule('/src/adapters/chrome/capture-frames.ts');
const { prepareExport } = await source.ssrLoadModule('/src/core/index.ts');
let sameOrigin;
let crossOrigin;
const http = httpServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.url === '/child') response.end(`<title>Embedded form</title><h2>Child content</h2><input aria-label="Email" value="synthetic@example.test"><input type="password" value="synthetic-password-never-export"><iframe title="Nested document" src="${sameOrigin}/leaf"></iframe>`);
  else if (request.url === '/leaf') response.end('<title>Leaf</title><h3>Leaf content</h3><a href="/resource">Resource</a>');
  else if (request.url === '/technical') response.end('<h3>Technical content must not be captured</h3>');
  else response.end(fixture.replaceAll('__SAME_ORIGIN__', sameOrigin).replaceAll('__CROSS_ORIGIN__', crossOrigin));
});
let processHandle;
let socket;
let profile;
try {
  await new Promise((done, reject) => { http.once('error', reject); http.listen(0, '0.0.0.0', done); });
  sameOrigin = `http://127.0.0.1:${http.address().port}`;
  crossOrigin = `http://localhost:${http.address().port}`;
  profile = await mkdtemp(resolve(tmpdir(), 'copy-as-context-iframe-'));
  processHandle = spawn(binary, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--site-per-process', ...(values.extension ? ['--enable-unsafe-extension-debugging'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20_000);
    let stderr = '';
    processHandle.on('error', reject);
    processHandle.once('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited')); });
    processHandle.stderr.on('data', (buffer) => {
      stderr = (stderr + buffer).slice(-8000);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  const detachers = new Set();
  let rootSession;
  let oopifs = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      message.error ? task.reject(new Error(message.error.message)) : task.done(message.result);
    } else if (message.sessionId) {
      if (message.method === 'Target.attachedToTarget' && message.params.targetInfo.type === 'iframe') oopifs++;
      for (const listener of listeners) listener({ tabId: 42, ...(message.sessionId !== rootSession ? { sessionId: message.sessionId } : {}) }, message.method, message.params);
    }
  });
  const command = (method, params = {}, sessionId) => new Promise((done, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 10_000);
    pending.set(id, { done, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const version = (await command('Browser.getVersion')).product;
  const { targetId } = await command('Target.createTarget', { url: sameOrigin });
  const loadingSession = (await command('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await command('Runtime.evaluate', { expression: 'document.readyState + location.href', returnByValue: true }, loadingSession);
    if (state.result.value === `complete${sameOrigin}/`) break;
    await new Promise(done => setTimeout(done, 100));
  }
  await command('Target.detachFromTarget', { sessionId: loadingSession });
  const calls = [];
  const client = {
    attach(_target, _version, done) {
      command('Target.attachToTarget', { targetId, flatten: true }).then(result => { rootSession = result.sessionId; done(); }, error => done(error.message));
    },
    sendCommand(target, method, done, params) {
      calls.push({ method, session: target.sessionId });
      command(method, params, target.sessionId ?? rootSession).then(result => done(result), error => done(undefined, error.message));
    },
    detach(_target, done) { command('Target.detachFromTarget', { sessionId: rootSession }).then(() => done(), error => done(error.message)); },
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onDetach(listener) { detachers.add(listener); return () => detachers.delete(listener); },
  };
  const capture = createFrameCapturer(client);
  let expected;
  for (let run = 0; run < 3; run++) {
    const result = await capture(42);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.warnings, undefined, JSON.stringify(result));
    const nodes = [];
    const visit = node => { nodes.push(node); node.children.forEach(visit); };
    visit(result.tree.root);
    assert.equal(nodes.filter(node => node.role === 'embedded-document').length, 6);
    assert.ok(nodes.some(node => node.name === 'Child content'));
    assert.ok(nodes.some(node => node.name === 'Leaf content'));
    const json = JSON.stringify(result);
    assert.ok(!json.includes('Technical content must not be captured'));
    assert.ok(!json.includes('synthetic-password-never-export'));
    assert.ok(!json.includes('backendDOMNodeId'));
    for (const level of ['without', 'detailed', 'compact', 'maximum']) {
      for (const format of ['semantic-text', 'markdown']) {
        const content = prepareExport(result.tree, level, format, false).serialized.content;
        assert.ok(content.includes('Child content'));
        assert.ok(!content.includes('synthetic-password-never-export'));
        assert.ok(!content.includes('Technical content must not be captured'));
      }
    }
    if (expected) assert.deepEqual(result.tree, expected, 'Repeated capture changed its contents');
    expected = result.tree;
    assert.equal(listeners.size, 0); assert.equal(detachers.size, 0);
  }
  assert.ok(oopifs >= 2, 'No nested out-of-process targets were observed');
  if (values.extension) {
    const { id: extensionId } = await command('Extensions.loadUnpacked', { path: resolve('.output/chrome-mv3') });
    await command('Target.activateTarget', { targetId });
    const tabs = await command('Target.getTargets', { filter: [{ type: 'tab', exclude: false }, { exclude: true }] });
    const tabTarget = tabs.targetInfos.find(info => info.url === `${sameOrigin}/`);
    assert.ok(tabTarget, 'No tab target for the fixture');
    await command('Extensions.triggerAction', { id: extensionId, targetId: tabTarget.targetId });
    let popupTarget;
    for (let attempt = 0; attempt < 100; attempt++) {
      const targets = await command('Target.getTargets');
      popupTarget = targets.targetInfos.find(info => info.url === `chrome-extension://${extensionId}/popup.html`)?.targetId;
      if (popupTarget) break;
      await new Promise(done => setTimeout(done, 100));
    }
    assert.ok(popupTarget, 'The extension action did not create a popup');
    const popupSession = (await command('Target.attachToTarget', { targetId: popupTarget, flatten: true })).sessionId;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await command('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, popupSession);
      if (state.result.value === 'complete') break;
      await new Promise(done => setTimeout(done, 100));
    }
    for (const format of ['semantic-text', 'markdown']) {
      const response = await command('Runtime.evaluate', {
        expression: `chrome.runtime.sendMessage(${JSON.stringify({ type: 'capture-active-tab', compression: 'compact', format, redactSensitiveData: false })})`,
        awaitPromise: true, returnByValue: true,
      }, popupSession);
      assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
      const result = response.result.value;
      assert.ok(result, JSON.stringify(response));
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.warnings, undefined, JSON.stringify(result));
      assert.ok(result.export.serialized.content.includes('Child content'));
      assert.ok(!result.export.serialized.content.includes('Technical content must not be captured'));
      assert.ok(!result.export.serialized.content.includes('synthetic-password-never-export'));
      assert.equal(result.export.characterCount, result.export.serialized.content.length);
    }
    await command('Target.detachFromTarget', { sessionId: popupSession });
    console.log('Built extension: chrome.debugger → background → popup response passed for both formats');
  }
  console.log(JSON.stringify({ version, captures: 3, embeddedDocumentsPerCapture: 6, oopifSessionsObserved: oopifs, assertions: 'passed', transport: 'native CDP (not chrome.debugger extension API)' }, null, 2));
} finally {
  socket?.close();
  if (processHandle && processHandle.exitCode === null) {
    await new Promise(done => { processHandle.once('exit', done); processHandle.kill(); setTimeout(() => { processHandle.kill('SIGKILL'); done(); }, 3000).unref(); });
  }
  if (profile) await rm(profile, { recursive: true, force: true });
  await new Promise(done => http.close(done));
  await source.close();
}
