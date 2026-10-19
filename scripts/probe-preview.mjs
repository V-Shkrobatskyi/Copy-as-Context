// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

/** Opt-in isolated Desktop probe. Firefox uses a synthetic export to test the handoff. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';

const firefox = process.argv.includes('--firefox');
const previewOnly = process.argv.includes('--preview-only');
const profile = await mkdtemp(resolve(tmpdir(), 'context-preview-'));
const downloads = resolve(profile, 'downloads');
await mkdir(downloads);
const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<title>Preview fixture</title><h1>Synthetic preview page</h1><p>token=synthetic-preview-secret</p><p>CLIENT_MARKER</p><p>ghp_abcdefghijklmnopqrstuvwxyz</p><p>https://example.test/?client_key=synthetic-custom-url-secret&amp;public=keep</p>'); });
let child;
let socket;
const pending = new Map();
let nextId = 0;
async function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 12_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function poll(fn, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await fn();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const fixture = `http://127.0.0.1:${server.address().port}/`;
  let extensionId;
  let extensionPath;
  const uuid = '11111111-2222-4333-8444-555555555555';
  if (firefox) {
    extensionPath = resolve(profile, 'extension');
    await cp('.output/firefox-mv3', extensionPath, { recursive: true });
    const manifest = JSON.parse(await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'));
    extensionId = manifest.browser_specific_settings.gecko.id;
    await writeFile(resolve(profile, 'user.js'), [
      'user_pref("app.update.enabled", false);',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      'user_pref("browser.download.folderList", 2);',
      'user_pref("browser.download.useDownloadDir", true);',
      'user_pref("browser.download.alwaysOpenPanel", false);',
      'user_pref("browser.helperApps.neverAsk.saveToDisk", "application/json");',
      `user_pref("browser.download.dir", ${JSON.stringify(downloads)});`,
      `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [extensionId]: uuid }))});`,
    ].join('\n'));
    // Keep the production popup URL so its peer identity is checked by the receiver.
    const entry = resolve(profile, 'handoff.ts');
    await writeFile(entry, `import { openPreview } from ${JSON.stringify(resolve('src/preview-session.ts'))}; import { prepareExport } from ${JSON.stringify(resolve('src/core/export.ts'))}; import { loadRedactionSettings } from ${JSON.stringify(resolve('src/redaction-settings.ts'))}; globalThis.probeOpenPreview = openPreview; globalThis.probePrepare = async () => prepareExport({schemaVersion:1,root:{role:'text',name:'Synthetic preview page CLIENT_MARKER token=synthetic-preview-secret ghp_abcdefghijklmnopqrstuvwxyz https://example.test/?client_key=synthetic-custom-url-secret&public=keep',children:[]}},'compact','semantic-text',true,await loadRedactionSettings());`);
    await build({ configFile: false, logLevel: 'silent', build: { lib: { entry, name: 'PreviewProbe', formats: ['iife'], fileName: () => 'probe-handoff.js' }, outDir: extensionPath, emptyOutDir: false } });
    const popup = resolve(extensionPath, 'popup.html');
    await writeFile(popup, (await readFile(popup, 'utf8')).replace('</body>', '<script src="probe-handoff.js"></script></body>'));
  }
  const binary = firefox ? (process.env.FIREFOX_BINARY ?? '/Applications/Firefox.app/Contents/MacOS/firefox') : (process.env.CHROME_BINARY ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  const args = firefox
    ? ['--headless', '--no-remote', '--remote-allow-system-access', '--profile', profile, '--remote-debugging-port', '0', 'about:blank']
    : ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'];
  child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 20_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Browser exited')); });
    const data = buffer => {
      output = (output + buffer).slice(-10_000);
      const match = output.match(firefox ? /WebDriver BiDi listening on (ws:\/\/[^\s]+)/u : /DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    child.stdout.on('data', data); child.stderr.on('data', data);
  });
  socket = new WebSocket(`${endpoint}${firefox ? '/session' : ''}`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const result = JSON.parse(data);
    const request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id); clearTimeout(request.timer);
    if (result.error || result.type === 'error') request.reject(new Error(JSON.stringify(result)));
    else request.resolve(result.result);
  });
  let contexts;
  let evaluate;
  let previewPrefix;
  async function customize(popupId, prefix) {
    await poll(() => evaluate(popupId, '!!document.querySelector("#customize")'), 'Customize button');
    assert.equal(await evaluate(popupId, '!!document.querySelector("#customize").closest(".privacy-setting")'), true);
    await evaluate(popupId, 'document.querySelector("#customize").click(); "started"');
    const settings = await poll(async () => (await contexts()).find(tab => tab.url === `${prefix}/filters.html`), 'filter settings tab');
    await poll(() => evaluate(settings.id, 'document.querySelectorAll(".builtin td:first-child input:checked").length === 8 && !document.querySelector("#add-rule")?.disabled'), 'default filters');
    assert.equal(await evaluate(settings.id, 'Array.from(document.querySelectorAll(".builtin select")).every(select=>select.disabled)'), true);
    const output = await evaluate(settings.id, `(()=>{
      document.querySelectorAll('.builtin td:first-child input')[3].click();
      document.querySelector('#add-rule').click();
      const name=document.querySelector('.custom-rule input[type="text"]'); name.value='Client'; name.dispatchEvent(new Event('input'));
      const text=document.querySelector('.custom-rule textarea'); text.value='CLIENT_MARKER'; text.dispatchEvent(new Event('input'));
      document.querySelector('#test-panel').open=true;
      document.querySelector('#test-input').value='Private sample: CLIENT_MARKER client_marker ghp_abcdefghijklmnopqrstuvwxyz';
      document.querySelector('#test-filters').click();
      return document.querySelector('#test-output').value;
    })()`);
    const tester = JSON.parse(await evaluate(settings.id, `(()=>{
      const select=document.querySelector('#test-rule');
      select.value=Array.from(select.options).find(option=>option.value.startsWith('custom:')).value;
      select.dispatchEvent(new Event('change'));
      document.querySelector('#test-input').value='CLIENT_MARKER token=synthetic-secret';
      document.querySelector('#test-selected').click();
      const isolated=document.querySelector('#test-output').value;
      const matches=document.querySelector('#test-matches').textContent;
      document.querySelector('#test-filters').click();
      const all=document.querySelector('#test-output').value;
      document.querySelector('#load-example').click(); document.querySelector('#test-selected').click();
      const example=document.querySelector('#test-output').value;
      document.querySelector('#load-near-miss').click();
      const nearInput=document.querySelector('#test-input').value;
      document.querySelector('#test-selected').click(); const near=document.querySelector('#test-output').value;
      select.value='builtin:sensitive-fields'; document.querySelector('#load-example').click(); document.querySelector('#test-selected').click();
      const field=document.querySelector('#test-output').value;
      document.querySelector('#test-field-label').value='Token'; document.querySelector('#test-input').value='eyJabcde.abcde.abcde';
      document.querySelector('#test-filters').click(); const overlapping=document.querySelector('#test-matches').textContent;
      return JSON.stringify({isolated,matches,all,example,nearInput,near,field,overlapping});
    })()`));
    assert.equal(tester.isolated, '[REDACTED] token=synthetic-secret');
    assert.ok(tester.matches.includes('Client') && !tester.matches.includes('Assigned secrets'));
    assert.equal(tester.all, '[REDACTED] token=[REDACTED]');
    assert.equal(tester.example, '[REDACTED]');
    assert.equal(tester.near, tester.nearInput);
    assert.equal(tester.field, '[REDACTED]');
    assert.ok(tester.overlapping.includes('Sensitive field values') && tester.overlapping.includes('JWTs'));
    const modes = JSON.parse(await evaluate(settings.id, `(()=>{
      const text=document.querySelector('.custom-rule textarea');
      const label=document.querySelector('#test-field-label');
      const sample=document.querySelector('#test-input');
      const type=document.querySelector('.custom-rule .rule-type-value select');
      const choose=value=>{type.value=value;type.dispatchEvent(new Event('change'));};
      text.value='pass / private code'; text.dispatchEvent(new Event('input'));
      choose('fieldLabels'); label.value='Pass phrase'; sample.value='short value'; document.querySelector('#test-filters').click();
      const field=document.querySelector('#test-output').value;
      choose('text'); label.value=''; sample.value='pass and private code'; document.querySelector('#test-filters').click();
      const plain=document.querySelector('#test-output').value;
      text.value='CLIENT_MARKER'; text.dispatchEvent(new Event('input'));
      return JSON.stringify({field,plain});
    })()`));
    assert.equal(modes.field, '[REDACTED]');
    assert.equal(modes.plain, '[REDACTED] and [REDACTED]');
    const urlResult = await evaluate(settings.id, `(()=>{
      const states=Array.from(document.querySelectorAll('.builtin td:first-child input'), input=>input.checked);
      document.querySelectorAll('.builtin td:first-child input').forEach(input=>{if(input.checked)input.click();});
      document.querySelector('#add-rule').click();
      const name=document.querySelector('.custom-rule:last-child input[type=text]'); name.value='URL secrets'; name.dispatchEvent(new Event('input'));
      const text=document.querySelector('.custom-rule:last-child textarea'); text.value='client_key / private_token'; text.dispatchEvent(new Event('input'));
      const type=document.querySelector('.custom-rule:last-child .rule-type-value select'); type.value='urlParameters'; type.dispatchEvent(new Event('change'));
      document.querySelector('#test-input').value='https://example.test/client_key?client_key=abc&private_token=xyz&public=keep';
      document.querySelector('#test-filters').click(); const output=document.querySelector('#test-output').value;
      document.querySelectorAll('.builtin td:first-child input').forEach((input,index)=>{if(input.checked!==states[index])input.click();});
      return output;
    })()`);
    assert.equal(urlResult, 'https://example.test/client_key?client_key=[REDACTED]&private_token=[REDACTED]&public=keep');
    const caseResult = await evaluate(settings.id, `(()=>{
      const flag=document.querySelectorAll('.builtin .case-value input')[4];
      flag.click();
      document.querySelector('#test-input').value='akia0123456789abcdef';
      document.querySelector('#test-filters').click();
      return document.querySelector('#test-output').value;
    })()`);
    assert.equal(caseResult, '[REDACTED]');
    const detectorResult = await evaluate(settings.id, `(()=>{
      const states=Array.from(document.querySelectorAll('.builtin td:first-child input'), input=>input.checked);
      document.querySelectorAll('.builtin td:first-child input').forEach(input=>{if(input.checked)input.click();});
      document.querySelectorAll('.builtin [data-duplicate]')[1].click();
      const text=document.querySelector('.custom-rule:last-child textarea'); text.value='CustomAuth'; text.dispatchEvent(new Event('input'));
      document.querySelector('#test-input').value='CustomAuth abcdefghijkl CustomAuth short';
      document.querySelector('#test-filters').click();
      const output=document.querySelector('#test-output').value;
      document.querySelectorAll('.builtin td:first-child input').forEach((input,index)=>{if(input.checked!==states[index])input.click();});
      return output;
    })()`);
    assert.equal(detectorResult, 'CustomAuth [REDACTED] CustomAuth short');
    await evaluate(settings.id, 'document.querySelector("#export-filters").click(); true');
    const exported = await poll(async () => {
      try { return JSON.parse(await readFile(resolve(downloads, 'copy-as-context-filters.json'), 'utf8')); }
      catch { return undefined; }
    }, 'downloaded filters file');
    assert.equal(exported.version, 13);
    assert.equal(exported.availableRuleTypes.length, 17);
    assert.ok(exported.availableRuleTypes.some(type => type.id === 'fieldWords' && type.scope === 'fields'));
    assert.ok(exported.filters.every(filter => !('fieldLabels' in filter) && !('urlParameters' in filter)));
    assert.equal(await evaluate(settings.id, 'document.querySelectorAll("thead th").length'), 6);
    assert.equal(exported.filters.filter(filter => filter.source === 'builtin').length, 16);
    assert.equal(exported.filters.find(filter => filter.id === 'github').enabled, false);
    assert.equal(exported.filters.find(filter => filter.id === 'aws').caseSensitive, false);
    assert.equal(exported.filters.find(filter => filter.id === 'query-values').type, 'urlParameters');
    assert.equal(exported.filters.find(filter => filter.name === 'URL secrets').type, 'urlParameters');
    assert.equal(exported.filters.find(filter => filter.matchingRule === 'CustomAuth').type, 'authorization');
    assert.equal(exported.filters.find(filter => filter.id === 'jwt').type, 'jwt');
    assert.ok(exported.filters.every(filter => !('text' in filter)));
    assert.deepEqual(Object.keys(exported.filters[0]), Object.keys(exported.filters.find(filter => filter.source === 'custom')));
    exported.filters.find(filter => filter.source === 'custom').name = 'Imported client';
    const importedPath = resolve(profile, 'imported-filters.json');
    await writeFile(importedPath, JSON.stringify(exported));
    await evaluate(settings.id, 'globalThis.confirm=()=>true; true');
    if (firefox) {
      // Exercise native File.text and the real change handler; the OS picker remains manual.
      await evaluate(settings.id, `(()=>{const transfer=new DataTransfer(); transfer.items.add(new File([${JSON.stringify(JSON.stringify(exported))}],'imported-filters.json',{type:'application/json'})); const input=document.querySelector('#import-file'); input.files=transfer.files; input.dispatchEvent(new Event('change')); return true;})()`);
    } else {
      const sessionId = (await send('Target.attachToTarget', { targetId: settings.id, flatten: true })).sessionId;
      await send('Page.enable', {}, sessionId);
      await send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
      await evaluate(settings.id, 'document.querySelector("#show-import").click(); true');
      const { root } = await send('DOM.getDocument', {}, sessionId);
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#import-file' }, sessionId);
      await send('DOM.setFileInputFiles', { nodeId, files: [importedPath] }, sessionId);
    }
    await poll(() => evaluate(settings.id, 'document.querySelector(".custom-rule input[type=text]")?.value === "Imported client"'), 'imported filter rows');
    const result = JSON.parse(await evaluate(settings.id, `(async()=>{
      document.querySelector('#save-filters').click();
      for(let attempt=0;attempt<80;attempt++) { if(document.querySelector('#status').textContent.includes('Filters saved')) break; await new Promise(resolve=>setTimeout(resolve,50)); }
      const stored=await (globalThis.browser||globalThis.chrome).storage.local.get('redaction-filters-v1');
      return JSON.stringify({output:${JSON.stringify(output)},config:stored['redaction-filters-v1'],status:document.querySelector('#status').textContent,overflow:document.documentElement.scrollWidth>innerWidth});
    })()`));
    assert.equal(result.output, 'Private sample: [REDACTED] [REDACTED] ghp_abcdefghijklmnopqrstuvwxyz');
    assert.ok(result.status.includes('Filters saved'), result.status);
    assert.equal(result.config.customRules[0].name, 'Imported client');
    assert.equal(result.config.customRules[0].text, 'CLIENT_MARKER');
    assert.deepEqual(result.config.disabledBuiltins, ['github', 'email-hide', 'phone-numbers', 'personal-fields']);
    assert.deepEqual(result.config.builtinCaseSensitivity, { aws: false });
    assert.equal(result.config.customRules[1].type, 'urlParameters');
    assert.equal(result.config.customRules[2].type, 'authorization');
    assert.equal(result.config.customRules[2].text, 'CustomAuth');
    assert.equal(JSON.stringify(result.config).includes('Private sample:'), false);
    assert.equal(result.overflow, false);
    if (firefox) await send('browsingContext.close', { context: settings.id });
    else {
      await evaluate(settings.id, 'window.scrollTo(0,0); true');
      const sessionId = (await send('Target.attachToTarget', { targetId: settings.id, flatten: true })).sessionId;
      await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(settings.id, 'document.querySelectorAll("details").forEach(section => { section.open = false; }); window.scrollTo(0,0); true');
      const bounds = JSON.parse(await evaluate(settings.id, 'JSON.stringify((()=>{const box=document.querySelector(".filters-section").getBoundingClientRect(); return {x:box.x,y:box.y,width:box.width,height:box.height,scale:1};})())'));
      const tableImage = await send('Page.captureScreenshot', { format: 'png', clip: bounds }, sessionId);
      await writeFile(resolve(tmpdir(), 'copy-as-context-filters-table.png'), Buffer.from(tableImage.data, 'base64'));
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
      await writeFile(resolve(tmpdir(), 'copy-as-context-filters.png'), Buffer.from(image.data, 'base64'));
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
      assert.equal(await evaluate(settings.id, 'document.documentElement.scrollWidth > innerWidth'), false);
      const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      await writeFile(resolve(tmpdir(), 'copy-as-context-filters-mobile.png'), Buffer.from(mobile.data, 'base64'));
      await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(settings.id, `(()=>{
        document.querySelector('#test-panel').open=true;
        const select=document.querySelector('#test-rule'); select.value=Array.from(select.options).find(option=>option.textContent.includes('Authorization values copy')).value;
        document.querySelector('#load-example').click(); document.querySelector('#test-selected').click();
        document.querySelector('#test-panel').scrollIntoView(); return true;
      })()`);
      const testerBounds = JSON.parse(await evaluate(settings.id, 'JSON.stringify((()=>{const box=document.querySelector("#test-panel").getBoundingClientRect();return{x:box.x,y:box.y+scrollY,width:box.width,height:box.height,scale:1};})())'));
      const testerImage = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: testerBounds }, sessionId);
      await writeFile(resolve(tmpdir(), 'copy-as-context-filter-tester.png'), Buffer.from(testerImage.data, 'base64'));
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
      assert.equal(await evaluate(settings.id, 'document.documentElement.scrollWidth > innerWidth'), false);
      const narrowBounds = JSON.parse(await evaluate(settings.id, 'JSON.stringify((()=>{const box=document.querySelector("#test-panel").getBoundingClientRect();return{x:box.x,y:box.y+scrollY,width:box.width,height:box.height,scale:1};})())'));
      const narrowTester = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: narrowBounds }, sessionId);
      await writeFile(resolve(tmpdir(), 'copy-as-context-filter-tester-mobile.png'), Buffer.from(narrowTester.data, 'base64'));

      await send('Target.closeTarget', { targetId: settings.id });
    }
  }
  if (firefox) {
    await send('session.new', { capabilities: { alwaysMatch: {} } });
    await send('webExtension.install', { extensionData: { type: 'path', path: extensionPath } });
    previewPrefix = `moz-extension://${uuid}/preview.html#`;
    const { context } = await send('browsingContext.create', { type: 'tab' });
    await send('browsingContext.navigate', { context, url: `moz-extension://${uuid}/popup.html`, wait: 'complete' });
    evaluate = async (context, expression) => {
      const response = await send('script.evaluate', { expression, target: { context }, awaitPromise: true });
      assert.equal(response.type, 'success', response.exceptionDetails?.text);
      return response.result.value;
    };
    contexts = async () => (await send('browsingContext.getTree', {})).contexts.map(item => ({ id: item.context, url: item.url }));
    if (!previewOnly) await customize(context, `moz-extension://${uuid}`);
    // Do not await activation from the opener: its real toolbar equivalent may be destroyed.
    await evaluate(context, `(async()=>{const result=await globalThis.probePrepare(); await globalThis.probeOpenPreview({content:result.serialized.content,compression:'compact',format:'semantic-text',redactSensitiveData:true,redactionCount:result.redactionCount,reductionRatio:result.reductionRatio,warnings:[]})})().catch(e=>{document.querySelector('.status').textContent=e.message}); 'started'`);
  } else {
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    ({ id: extensionId } = await send('Extensions.loadUnpacked', { path: resolve('.output/chrome-mv3') }));
    previewPrefix = `chrome-extension://${extensionId}/preview.html#`;
    const { targetId } = await send('Target.createTarget', { url: fixture });
    await send('Target.activateTarget', { targetId });
    const tabs = await send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }, { exclude: true }] });
    const tab = tabs.targetInfos.find(tab => tab.url === fixture);
    assert.ok(tab);
    await send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
    const popup = await poll(async () => (await send('Target.getTargets')).targetInfos.find(tab => tab.url === `chrome-extension://${extensionId}/popup.html`), 'popup');
    const sessions = new Map();
    evaluate = async (targetId, expression) => {
      if (!sessions.has(targetId)) sessions.set(targetId, (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId);
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sessions.get(targetId));
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    contexts = async () => (await send('Target.getTargets')).targetInfos.map(item => ({ id: item.targetId, url: item.url }));
    if (!previewOnly) await customize(popup.targetId, `chrome-extension://${extensionId}`);
    await send('Target.activateTarget', { targetId });
    await send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
    const refreshed = await poll(async () => (await send('Target.getTargets')).targetInfos.find(item => item.url === `chrome-extension://${extensionId}/popup.html`), 'reopened popup');
    await poll(() => evaluate(refreshed.targetId, '!!document.querySelector("#preview")'), 'popup initialization');
    await evaluate(refreshed.targetId, 'document.querySelector("#preview").click(); "started"');
  }
  const preview = await poll(async () => (await contexts()).find(tab => tab.url.startsWith(previewPrefix)), 'preview tab');
  await poll(() => evaluate(preview.id, 'document.querySelector("#editor-panel")?.hidden === false'), 'accepted preview');
  const original = await evaluate(preview.id, 'document.querySelector("#context").value');
  assert.ok(original.includes('Synthetic preview page'));
  assert.ok(original.includes('[REDACTED]'));
  assert.ok(!original.includes('synthetic-preview-secret'));
  if (!previewOnly) {
    assert.ok(!original.includes('CLIENT_MARKER'));
    assert.ok(original.includes('ghp_abcdefghijklmnopqrstuvwxyz'), 'Disabled GitHub group did not persist');
    assert.ok(!original.includes('synthetic-custom-url-secret'), 'Custom URL parameter rule did not apply to the next export');
    assert.ok(original.includes('client_key=[REDACTED]'));
  }
  const metrics = await evaluate(preview.id, 'document.querySelector("#metrics").textContent');
  const wrappedLength = `<web_page>\n${original}${original.endsWith('\n') ? '' : '\n'}</web_page>\n`.length;
  assert.ok(metrics.includes(`${wrappedLength} characters to copy`));
  assert.ok(metrics.includes(`File/editor: ${original.length} characters`));
  assert.ok((await evaluate(preview.id, 'document.querySelector("#compression-metrics").textContent')).includes('% smaller than Without'));
  const searchResult = JSON.parse(await evaluate(preview.id, `(()=>{
    const editor=document.querySelector('#context'); editor.value='😀 Cat cat a.b'; editor.dispatchEvent(new Event('input')); editor.setSelectionRange(0,0);
    const find=document.querySelector('#find-text'); find.value='cat'; find.dispatchEvent(new Event('input'));
    document.querySelector('#find-next').click();
    const selection=[editor.selectionStart,editor.selectionEnd];
    document.querySelector('#replace-text').value='$&dog'; document.querySelector('#replace-one').click();
    const single=editor.value;
    document.querySelector('#replace-text').value=''; document.querySelector('#replace-all').click();
    const all=editor.value;
    find.value='a.b'; find.dispatchEvent(new Event('input')); document.querySelector('#find-next').click();
    return JSON.stringify({selection,single,all,selected:editor.value.slice(editor.selectionStart,editor.selectionEnd)});
  })()`));
  assert.deepEqual(searchResult, { selection: [3, 6], single: '😀 $&dog cat a.b', all: '😀 $&dog  a.b', selected: 'a.b' });
  async function checkSearchScrolling() {
    const result = JSON.parse(await evaluate(preview.id, `(()=>{
      const editor=document.querySelector('#context');
      const find=document.querySelector('#find-text');
      const segment=('Wrapped Unicode 😀 content with tabs\\tand spaces. '.repeat(12)+'\\n').repeat(60);
      editor.value='SCROLL_HIT\\n'+segment+'SCROLL_HIT\\n'+segment+'SCROLL_HIT';
      editor.dispatchEvent(new Event('input')); editor.setSelectionRange(0,0); editor.scrollTop=0;
      find.value='SCROLL_HIT'; find.dispatchEvent(new Event('input'));
      document.querySelector('#find-next').click(); const first=editor.scrollTop;
      document.querySelector('#find-next').click(); const middle=editor.scrollTop;
      document.querySelector('#find-next').click(); const last=editor.scrollTop;
      const maximum=editor.scrollHeight-editor.clientHeight;
      document.querySelector('#find-previous').click(); const previousMiddle=editor.scrollTop;
      document.querySelector('#find-previous').click(); const previous=editor.scrollTop;
      document.querySelector('#find-previous').click(); const wrapped=editor.scrollTop;
      document.querySelector('#replace-text').value='CHANGED'; document.querySelector('#replace-one').click();
      return JSON.stringify({first,middle,last,maximum,previousMiddle,previous,wrapped,afterReplace:editor.scrollTop,selected:editor.value.slice(editor.selectionStart,editor.selectionEnd)});
    })()`));
    assert.equal(result.first, 0);
    assert.ok(result.maximum > 1000, 'Scrolling fixture must exceed the editor viewport');
    assert.ok(Math.abs(result.middle - result.maximum / 2) < 64, JSON.stringify(result));
    assert.equal(result.previousMiddle, result.middle);
    assert.ok(Math.abs(result.last - result.maximum) < 4, JSON.stringify(result));
    assert.equal(result.previous, 0);
    assert.ok(Math.abs(result.wrapped - result.maximum) < 4, JSON.stringify(result));
    assert.equal(result.afterReplace, 0);
    assert.equal(result.selected, 'SCROLL_HIT');
  }
  await checkSearchScrolling();
  // Intercept only the destination, so the probe never modifies the system clipboard.
  const copied = JSON.parse(await evaluate(preview.id, `(async()=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{globalThis.probeCopied=text}}});
    const editor=document.querySelector('#context'); editor.value='  Edited context 😀\\n'; editor.dispatchEvent(new Event('input'));
    document.querySelector('#copy').click(); await new Promise(resolve=>setTimeout(resolve,150));
    return JSON.stringify({text:globalThis.probeCopied,status:document.querySelector('#status').textContent,overflow:document.documentElement.scrollWidth>innerWidth});
  })()`));
  assert.equal(copied.text, '<web_page>\n  Edited context 😀\n</web_page>\n');
  assert.ok(copied.status.includes('Copied edited context.'));
  assert.equal(copied.overflow, false);
  if (!firefox) {
    await evaluate(preview.id, 'document.querySelector("#save").click(); true');
    await poll(() => evaluate(preview.id, 'document.querySelector("#status").textContent.includes("Saved edited context.")'), 'editor file download');
    const file = (await readdir(downloads)).find(name => name.endsWith('.txt'));
    assert.ok(file, 'Editor did not create a text file');
    assert.equal(await readFile(resolve(downloads, file), 'utf8'), '  Edited context 😀\n');
  }
  await evaluate(preview.id, `document.querySelector('#context').value=${JSON.stringify(original)}; document.querySelector('#context').dispatchEvent(new Event('input')); 'clean'`);
  if (!firefox) {
    const sessionId = (await send('Target.attachToTarget', { targetId: preview.id, flatten: true })).sessionId;
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(resolve(tmpdir(), 'copy-as-context-preview.png'), Buffer.from(screenshot.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await checkSearchScrolling();
    await evaluate(preview.id, `document.querySelector('#context').value=${JSON.stringify(original)}; document.querySelector('#context').dispatchEvent(new Event('input')); 'clean'`);
    assert.equal(await evaluate(preview.id, 'document.documentElement.scrollWidth > innerWidth'), false);
    const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(resolve(tmpdir(), 'copy-as-context-preview-mobile.png'), Buffer.from(mobile.data, 'base64'));
    await send('Page.reload', {}, sessionId);
  } else {
    await send('browsingContext.reload', { context: preview.id, wait: 'complete' });
  }
  await poll(() => evaluate(preview.id, 'document.querySelector("#status")?.textContent.includes("No preview was received")'), 'expired session');
  assert.equal(await evaluate(preview.id, 'document.querySelector("#context").value'), '');
  console.log(JSON.stringify({ browser: firefox ? 'Firefox Desktop' : 'Chrome Desktop', capture: firefox ? 'synthetic handoff; production activeTab not tested' : 'production toolbar capture', customizeFilters: previewOnly ? 'skipped' : 'passed (builtins, custom detectors, duplication, isolated/all testing, matched rules, examples, v7 typed import/export and persistence)', filterDownload: previewOnly ? 'skipped' : 'passed (actual file read back from disk)', filterImport: previewOnly ? 'skipped' : firefox ? 'passed (native File and change handler)' : 'passed (filesystem file through intercepted picker)', privatePortHandoff: 'passed', findAndReplace: 'passed (navigation, automatic scrolling through wrapped text, literal replacement, replace one/all, deletion)', editsAndCopy: 'passed (clipboard intercepted)', reloadDiscardsDraft: 'passed', androidNative: 'not tested' }, null, 2));
} finally {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Probe closed')); }
  pending.clear(); socket?.close();
  if (child && child.exitCode === null) await new Promise(resolve => {
    child.once('exit', resolve); child.kill();
    setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref();
  });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
