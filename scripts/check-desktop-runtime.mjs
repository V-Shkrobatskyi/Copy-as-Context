import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const { values: options } = parseArgs({ options: { targets: { type: 'string' }, report: { type: 'string' }, 'firefox-binary': { type: 'string' }, 'chrome-binary': { type: 'string' }, 'popup-layout': { type: 'string', default: 'desktop' } } });
const fixture = await readFile('tests/fixtures/quality/desktop-holdout.html', 'utf8');
const collector = await readFile('.output/firefox-mv3/dom-capture.js', 'utf8');
const firefoxManifest = JSON.parse(await readFile('.output/firefox-mv3/manifest.json', 'utf8'));
assert.ok(['desktop', 'android'].includes(options['popup-layout']), 'Unknown popup layout');
const popupAssets = options['popup-layout'] === 'android' ? '.output/firefox-mv3-android-test/assets' : '.output/firefox-mv3/assets';
const popupCssName = (await readdir(popupAssets)).find((name) => name.startsWith('popup-') && name.endsWith('.css'));
const popupCss = await readFile(`${popupAssets}/${popupCssName}`, 'utf8');
const fixtureExtensionUuid = '11111111-2222-4333-8444-555555555555';
const source = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { normalizeChromeAxTree } = await source.ssrLoadModule('/src/adapters/chrome/normalize-ax.ts');
const { prepareExport, COMPRESSION_LEVELS } = await source.ssrLoadModule('/src/core/index.ts');
const { assertDesktopQuality, assertDesktopUpdate, updateDesktopFixture, flattenWithAncestors } = await source.ssrLoadModule('/tests/helpers/desktop-quality.ts');
const { contextDownloadOptions } = await source.ssrLoadModule('/src/download-context.ts');
const http = httpServer((_request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fixture); });
try {
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); });
} catch (error) { await source.close(); throw error; }
const url = `http://127.0.0.1:${http.address().port}/`;
const reports = [];
const platforms = process.platform === 'darwin'
  ? { firefox: '/Applications/Firefox.app/Contents/MacOS/firefox', chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
  : { firefox: 'firefox', chrome: 'google-chrome' };

class Protocol {
  #socket;
  #id = 0;
  #pending = new Map();
  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', ({ data }) => {
      const value = JSON.parse(data);
      const pending = this.#pending.get(value.id);
      if (!pending) return;
      this.#pending.delete(value.id);
      clearTimeout(pending.timer);
      if (value.error || value.type === 'error') pending.reject(new Error(`${pending.method}: ${JSON.stringify(value.error)} ${value.message ?? ''}`));
      else pending.resolve(value.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Browser connection closed')); }
      this.#pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    return new Protocol(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15_000);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { this.#socket.close(); }
}

async function launch(target) {
  const profile = await mkdtemp(resolve(tmpdir(), `copy-as-context-${target}-`));
  const downloadsDirectory = resolve(profile, 'downloads');
  await mkdir(downloadsDirectory);
  const binary = options[`${target}-binary`] ?? process.env[`${target.toUpperCase()}_BINARY`] ?? platforms[target];
  const flags = target === 'firefox'
    ? ['--headless', '--no-remote', '--remote-allow-system-access', '--profile', profile, '--remote-debugging-port', '0', 'about:blank']
    : ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'];
  if (target === 'firefox') await writeFile(resolve(profile, 'user.js'), [
    'user_pref("app.update.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("browser.download.folderList", 2);',
    'user_pref("browser.download.useDownloadDir", true);',
    `user_pref("browser.download.dir", ${JSON.stringify(downloadsDirectory)});`,
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [firefoxManifest.browser_specific_settings.gecko.id]: fixtureExtensionUuid }))});`,
  ].join('\n'));
  const child = spawn(binary, flags, { stdio: ['ignore', 'pipe', 'pipe'] });
  let close;
  const closed = new Promise((resolve) => { close = resolve; });
  child.once('exit', close);
  const stop = async () => {
    child.kill('SIGTERM');
    let timer;
    await Promise.race([closed, new Promise((resolve) => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); })]);
    clearTimeout(timer);
    await rm(profile, { recursive: true, force: true });
  };
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error(`${target} did not start its automation endpoint: ${text.slice(-1500)}`)), 20_000);
      const fail = (error) => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', (code) => fail(new Error(`${target} exited during startup (${code})`)));
      const data = (buffer) => {
        text = (text + buffer.toString()).slice(-8000);
        const match = text.match(target === 'firefox' ? /WebDriver BiDi listening on (ws:\/\/[^\s]+)/u : /DevTools listening on (ws:\/\/[^\s]+)/u);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      };
      child.stdout.on('data', data); child.stderr.on('data', data);
    });
    const protocol = await Protocol.connect(target === 'firefox' ? `${endpoint.replace(/\/$/u, '')}/session` : endpoint);
    return { protocol, stop, pid: child.pid, downloadsDirectory };
  } catch (error) { await stop(); throw error; }
}

const rss = async (pid) => {
  try { const { stdout } = await promisify(execFile)('ps', ['-o', 'rss=', '-p', String(pid)]); return Number(stdout.trim()) * 1024; }
  catch { return null; }
};

try {
  for (const target of (options.targets ?? process.env.DESKTOP_TARGETS ?? 'firefox,chrome').split(',')) {
    assert.ok(['firefox', 'chrome'].includes(target), 'Unknown Desktop target');
    const browser = await launch(target);
    const protocol = browser.protocol;
    try {
      let evaluate, capture, version, extensionSmoke;
      if (target === 'firefox') {
        const session = await protocol.send('session.new', { capabilities: { alwaysMatch: {} } });
        version = session.capabilities.browserVersion;
        const { context } = await protocol.send('browsingContext.create', { type: 'tab' });
        await protocol.send('browsingContext.navigate', { context, url, wait: 'complete' });
        extensionSmoke = async () => {
          const { extension } = await protocol.send('webExtension.install', { extensionData: { type: 'path', path: resolve('.output/firefox-mv3') } });
          assert.equal(extension, firefoxManifest.browser_specific_settings.gecko.id);
          const popupUrl = `moz-extension://${fixtureExtensionUuid}/popup.html`;
          let { context: popup } = await protocol.send('browsingContext.create', { type: 'tab' });
          const extensionEvaluate = async (expression) => {
            const response = await protocol.send('script.evaluate', { expression, target: { context: popup }, awaitPromise: true });
            assert.equal(response.type, 'success', 'Extension script failed (details omitted to avoid retaining synthetic export URLs)');
            return response.result.value;
          };
          await protocol.send('browsingContext.navigate', { context: popup, url: popupUrl, wait: 'complete' });
          assert.equal(await extensionEvaluate('browser.runtime.id'), extension);
          assert.equal(await extensionEvaluate('typeof browser.scripting.executeScript'), 'function');
          await extensionEvaluate('browser.storage.local.set({ desktopQualityProbe: "synthetic-setting" })');
          await protocol.send('browsingContext.activate', { context });
          const denied = JSON.parse(await extensionEvaluate(`(async () => {
            const own = await browser.tabs.getCurrent();
            const [page] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
            if (!page || page.id === own.id) throw new Error('Fixture tab is not active');
            let injectionDenied = false;
            try { await browser.scripting.executeScript({ target: { tabId: page.id, frameIds: [0] }, files: ['/dom-capture.js'], world: 'ISOLATED' }); }
            catch (error) { injectionDenied = /permission|not allowed|cannot access|restricted|access denied/i.test(error.message); }
            const message = await browser.runtime.sendMessage({ type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true });
            return JSON.stringify({ injectionDenied, tabDocumentSenderRejected: message === undefined });
          })()`));
          assert.deepEqual(denied, { injectionDenied: true, tabDocumentSenderRejected: true });
          await extensionEvaluate('browser.runtime.reload()');
          try { await protocol.send('browsingContext.close', { context: popup }); } catch { /* Reload may already close the extension document. */ }
          ({ context: popup } = await protocol.send('browsingContext.create', { type: 'tab' }));
          let restored = false;
          let reloadError;
          for (let attempt = 0; attempt < 30 && !restored; attempt++) {
            try {
              await protocol.send('browsingContext.navigate', { context: popup, url: popupUrl, wait: 'complete' });
              restored = await extensionEvaluate('(async () => (await browser.storage.local.get("desktopQualityProbe")).desktopQualityProbe === "synthetic-setting")()');
            } catch (error) { reloadError = error; }
            if (!restored) await new Promise((resolve) => setTimeout(resolve, 100));
          }
          assert.ok(restored, `Extension storage did not survive reload: ${reloadError?.message ?? 'setting missing'}`);
          const viewports = [];
          const popupMarkup = await extensionEvaluate('document.querySelector("#app").innerHTML');
          for (const width of options['popup-layout'] === 'android' ? [280, 320, 376] : [376]) {
            const layout = JSON.parse(await evaluate(`(async () => {
              const frame = document.createElement('iframe');
              frame.style.cssText = 'width:${width}px;height:640px;border:0';
              const loaded = new Promise(resolve => { frame.onload = resolve; });
              frame.srcdoc = ${JSON.stringify(`<style>${popupCss}</style>${popupMarkup}`)};
              document.body.append(frame);
              await loaded;
              const doc = frame.contentDocument;
              doc.querySelector('.feedback').hidden = false;
              doc.querySelector('.metrics').textContent = ${JSON.stringify(options['popup-layout'] === 'android' ? 'SyntheticLongMetric'.repeat(30) : '100 characters · ~25 tokens · 0 redactions')};
              const layout = { width: frame.contentWindow.innerWidth, scrollWidth: doc.documentElement.scrollWidth, buttonHeight: doc.querySelector('.primary-action').getBoundingClientRect().height, popupWidth: doc.querySelector('.popup').getBoundingClientRect().width, rangeHeight: doc.querySelector('input[type=range]').getBoundingClientRect().height };
              frame.remove();
              return JSON.stringify(layout);
            })()`));
            assert.ok(layout.scrollWidth <= layout.width, 'Popup overflows narrow viewport');
            if (options['popup-layout'] === 'android' && width < 376) assert.ok(layout.buttonHeight >= 44, 'Narrow viewport button is too small');
            if (options['popup-layout'] === 'desktop') {
              assert.equal(layout.popupWidth, 376, 'Desktop popup width changed');
              assert.equal(layout.rangeHeight, 18, 'Desktop range uses mobile sizing');
              assert.ok(layout.buttonHeight < 44, 'Desktop button uses mobile sizing');
            }
            viewports.push(layout);
          }
          const savedDownloads = [];
          for (const format of ['semantic-text', 'markdown']) {
            const content = 'Synthetic download context 🙂 東京 Україна & % , +\n'.repeat(2000);
            const mime = format === 'markdown' ? 'text/markdown' : 'text/plain';
            const blobUrl = await extensionEvaluate(`URL.createObjectURL(new Blob([${JSON.stringify(content)}], { type: ${JSON.stringify(`${mime};charset=utf-8`)} }))`);
            const options = contextDownloadOptions(blobUrl, format);
            // The harness uses its temporary download directory instead of opening a Save As dialog.
            const id = await extensionEvaluate(`browser.downloads.download(${JSON.stringify({ ...options, saveAs: false })})`);
            assert.ok(Number.isInteger(id));
            await protocol.send('browsingContext.close', { context: popup });
            ({ context: popup } = await protocol.send('browsingContext.create', { type: 'tab' }));
            await protocol.send('browsingContext.navigate', { context: popup, url: popupUrl, wait: 'complete' });
            let completed = false;
            for (let attempt = 0; attempt < 100 && !completed; attempt++) {
              const items = JSON.parse(await extensionEvaluate(`browser.downloads.search({ id: ${id} }).then(items => JSON.stringify(items.map(item => ({ state: item.state, error: item.error }))))`));
              assert.ok(!items[0]?.error, 'Synthetic download was interrupted');
              completed = items[0]?.state === 'complete';
              if (!completed) await new Promise((resolve) => setTimeout(resolve, 100));
            }
            assert.ok(completed, 'Download did not finish after popup document closed');
            const bytes = await readFile(resolve(browser.downloadsDirectory, options.filename));
            assert.equal(bytes.toString('utf8'), content);
            savedDownloads.push({ format, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), completedAfterPopupClose: true });
          }
          await protocol.send('browsingContext.close', { context: popup });
          await protocol.send('webExtension.uninstall', { extension });
          return { temporaryInstall: true, popupDocument: true, missingActiveTabGrant: 'injection-rejected', tabDocumentSenderRejected: true, reloadAndStorage: true, popupLayout: options['popup-layout'], viewports, savedDownloads };
        };
        evaluate = async (expression) => {
          const response = await protocol.send('script.evaluate', { expression, target: { context, sandbox: 'copy-as-context-quality' }, awaitPromise: true });
          assert.equal(response.type, 'success', 'Gecko script failed');
          return response.result.value;
        };
        capture = async () => {
          const measured = JSON.parse(await evaluate(`(() => {
            let passwordReads = 0;
            for (const input of document.querySelectorAll('input[type="password"]')) Object.defineProperty(input, 'value', { configurable: true, get() { passwordReads++; throw new Error('Password read'); } });
            const start = performance.now();
            const result = eval(${JSON.stringify(collector)});
            return JSON.stringify({ result, captureMs: performance.now() - start, passwordReads });
          })()`));
          assert.equal(measured.passwordReads, 0);
          return measured;
        };
      } else {
        version = (await protocol.send('Browser.getVersion')).product;
        const { targetId } = await protocol.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await protocol.send('Target.attachToTarget', { targetId, flatten: true });
        const send = (method, params) => protocol.send(method, params, sessionId);
        evaluate = async (expression) => {
          const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          assert.equal(response.exceptionDetails, undefined, 'Chromium script failed');
          return response.result.value;
        };
        await send('Page.navigate', { url });
        let ready = false;
        for (let attempt = 0; attempt < 100 && !ready; attempt++) {
          try { ready = await evaluate('document.readyState === "complete" && document.title === "Desktop semantic holdout"'); }
          catch { /* Navigation can briefly replace the evaluation context. */ }
          if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(ready, 'Chromium fixture did not finish loading');
        capture = async () => {
          const start = performance.now();
          await send('Accessibility.enable');
          let raw;
          try { raw = await send('Accessibility.getFullAXTree'); }
          finally { await send('Accessibility.disable'); }
          const result = normalizeChromeAxTree(raw);
          if (result.ok) { result.tree.title = 'Desktop semantic holdout'; result.tree.sourceUrl = url; }
          return { result, captureMs: performance.now() - start };
        };
      }
      const report = { target, version, quality: false, updates: false, samples: [], limitations: ['Headless capture/semantics probe; extension toolbar grants, popup, clipboard, downloads and event-page lifetime require separate smoke tests.'] };
      const initial = await capture();
      assert.equal(initial.result.ok, true, `${target}: capture failed`);
      assertDesktopQuality(initial.result.tree);
      report.quality = true;
      await evaluate(updateDesktopFixture);
      const updated = await capture();
      assert.equal(updated.result.ok, true);
      assertDesktopUpdate(updated.result.tree);
      report.updates = true;
      if (extensionSmoke) report.extensionBoundary = await extensionSmoke();
      const rssBefore = await rss(browser.pid);
      for (const rows of [20, 200, 1000]) {
        await evaluate(`document.body.innerHTML = '<main><table><caption>Performance inventory</caption><tbody>' + Array.from({ length: ${rows} }, (_, i) => '<tr><th scope="row">Synthetic resource ' + i + '</th><td><button>Review resource configuration</button><input aria-label="Resource enabled" type="checkbox" checked></td></tr>').join('') + '</tbody></table></main>'`);
        await capture();
        for (let repetition = 0; repetition < 5; repetition++) {
          const start = performance.now();
          const measured = await capture();
          assert.equal(measured.result.ok, true, `${target}/${rows}: ${measured.result.error?.code}`);
          const tree = measured.result.tree;
          if (target === 'firefox') assert.ok(measured.captureMs < 2500, 'DOM capture exceeded the 2s budget plus measurement tolerance');
          const exports = [];
          for (const profile of COMPRESSION_LEVELS) for (const format of ['semantic-text', 'markdown']) {
            const exportStart = performance.now();
            const output = prepareExport(tree, profile, format, true);
            exports.push({ profile, format, exportMs: performance.now() - exportStart, characters: output.characterCount, reductionRatio: output.reductionRatio });
          }
          report.samples.push({ rows, repetition, captureMs: measured.captureMs, totalMs: performance.now() - start, nodes: flattenWithAncestors(tree.root).length, payloadBytes: Buffer.byteLength(JSON.stringify(measured.result)), exports });
        }
        console.log(`${target}: ${rows} rows, five measured captures and eight exports per capture passed`);
      }
      report.parentProcessRssBefore = rssBefore;
      report.parentProcessRssAfter = await rss(browser.pid);
      report.limitations.push('RSS samples cover only the automation parent process, excluding renderer/content processes; they are neither peak memory nor proof of no leaks. Timings include automation overhead and sequential Node export for all eight combinations.');
      if (target === 'firefox') {
        await evaluate(`document.body.innerHTML = '<main>' + '<p>Overflow sentinel</p>'.repeat(12000) + '</main>'`);
        const overflow = await capture();
        assert.deepEqual(overflow.result, { ok: false, error: { code: 'capture-limit', message: 'This page exceeds the capture limits.' } });
        report.overflow = 'capture-limit (no partial tree)';
        await evaluate(`document.body.innerHTML = '<main><button>Recovered action</button></main>'`);
        assert.equal((await capture()).result.ok, true, 'Collector failed to recover after overflow');
      }
      reports.push(report);
      console.log(`${target} ${version}: holdout semantics, privacy, hierarchy, SPA updates and performance passed`);
    } finally { protocol.close(); await browser.stop(); }
  }
  if (options.report ?? process.env.DESKTOP_REPORT) {
    const path = resolve(options.report ?? process.env.DESKTOP_REPORT);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, reports }, null, 2)}\n`);
    console.log(`Structural metrics written to ${path}`);
  }
} finally { await source.close(); await new Promise((resolve) => http.close(resolve)); }
