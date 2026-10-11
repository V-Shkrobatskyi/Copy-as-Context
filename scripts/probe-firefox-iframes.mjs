import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { build } from 'vite';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
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


let port;
const fixture = await readFile('tests/manual/firefox-iframe-quality.html', 'utf8');
const server = createServer((req, res) => {
 res.setHeader('content-type','text/html; charset=utf-8');
 if (req.url === '/child') return res.end('<title>Child</title><p>CHILD_MARKER</p><input type="password" value="SYNTHETIC_PASSWORD"><iframe title="Nested document" src="/nested" style="width:300px;height:80px"></iframe>');
 if (['/nested','/hidden','/below','/shadow'].includes(req.url)) return res.end(`<title>Embedded fixture</title><p>${req.url.slice(1).toUpperCase()}_MARKER</p>`);
 res.end(fixture.replaceAll('__PORT__', String(port)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r)); port=server.address().port;
if(process.argv.includes('--serve')) {
 console.log(`Fixture: http://127.0.0.1:${port}/ (cross-origin host: localhost, same port)`);
 await new Promise(resolve=>{for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(resolve));});
 process.exit(0);
}
const profile = await mkdtemp(resolve(tmpdir(), 'firefox-iframe-probe-'));
const uuid = '11111111-2222-4333-8444-555555555555';
const original = JSON.parse(await readFile('.output/firefox-mv3/manifest.json', 'utf8'));
const extensionPath = resolve(profile, 'extension');
await cp('.output/firefox-mv3', extensionPath, { recursive: true });
const entry = resolve(profile, 'probe-entry.ts');
await writeFile(entry, `export { captureFirefoxPage } from ${JSON.stringify(resolve('src/adapters/firefox/capture.ts'))};\nexport { prepareExport } from ${JSON.stringify(resolve('src/core/index.ts'))};`);
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry, name: 'FirefoxProbe', formats: ['iife'], fileName: () => 'probe-capture.js' }, outDir: extensionPath, emptyOutDir: false } });
await writeFile(resolve(extensionPath, 'probe.html'), '<!doctype html><title>Iframe probe</title><script src="probe-capture.js"></script>');
const manifest = { ...original, permissions: [...original.permissions, 'tabs'], host_permissions: ['http://127.0.0.1/*'] };
await writeFile(resolve(extensionPath, 'manifest.json'), JSON.stringify(manifest));
await writeFile(resolve(profile, 'user.js'), [
  'user_pref("app.update.enabled", false);',
  'user_pref("extensions.webextensions.keepUuidOnUninstall", true);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({[original.browser_specific_settings.gecko.id]:uuid}))});`
].join('\n'));
const child=spawn('/Applications/Firefox.app/Contents/MacOS/firefox',['--headless','--no-remote','--remote-allow-system-access','--profile',profile,'--remote-debugging-port','0','about:blank'],{stdio:['ignore','pipe','pipe']});
let protocol;
try {
 const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Firefox startup timed out')),20000);child.once('error',reject);const data=b=>{output+=b;const m=output.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}};child.stdout.on('data',data);child.stderr.on('data',data);});
 protocol=await Protocol.connect(endpoint+'/session');
 const session=await protocol.send('session.new',{capabilities:{alwaysMatch:{}}});
 const {context:page}=await protocol.send('browsingContext.create',{type:'tab'});
 await protocol.send('browsingContext.navigate',{context:page,url:`http://127.0.0.1:${port}/`,wait:'complete'});
 await protocol.send('webExtension.install',{extensionData:{type:'path',path:extensionPath}});
 let {context:probe}=await protocol.send('browsingContext.create',{type:'tab'});
 await protocol.send('browsingContext.navigate',{context:probe,url:`moz-extension://${uuid}/probe.html`,wait:'complete'});
 const evaluate=async expression=>{const r=await protocol.send('script.evaluate',{expression,target:{context:probe},awaitPromise:true});assert.equal(r.type,'success',r.exceptionDetails?.text);return r.result.value;};
 const result=JSON.parse(await evaluate(`(async()=>{
 const tab=(await browser.tabs.query({})).find(t=>t.url==='http://127.0.0.1:${port}/');
 if(!tab) throw Error(JSON.stringify(await browser.tabs.query({}))); const [{result:owners}]=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:()=>Array.from(document.querySelectorAll('iframe'),e=>({name:e.id,id:browser.runtime.getFrameId(e)})),world:'ISOLATED'});
 const results=[];
 for(const owner of owners){try{const r=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[owner.id]},func:()=>({url:location.href}),world:'ISOLATED'});results.push({name:owner.name,ok:r.length===1&&!r[0].error,url:r[0]?.result?.url});}catch{results.push({name:owner.name,ok:false});}}
 return JSON.stringify({owners,results});
 })()`));
 assert.ok(result.owners.every(x=>x.id>0));
 assert.equal(result.results.find(x=>x.name==='same').ok,true);
 assert.equal(result.results.find(x=>x.name==='cross').ok,false);
 const captures=JSON.parse(await evaluate(`(async()=>{
 const tab=(await browser.tabs.query({})).find(t=>t.url==='http://127.0.0.1:${port}/');
 const summaries=[];
 for(let n=0;n<3;n++){
  const result=await FirefoxProbe.captureFirefoxPage(tab,'2026.10.11 12:00:00');
  if(!result.ok) return JSON.stringify({error:result.error});
  for(const privacy of [true,false]) for(const level of ['without','detailed','compact','maximum']) for(const format of ['semantic-text','markdown']){
   const content=FirefoxProbe.prepareExport(result.tree,level,format,privacy).serialized.content.replaceAll(String.fromCharCode(92),'');
   if(!content.includes('SRCDOC_MARKER')) throw Error('Missing inherited srcdoc content');
   if(content.includes('SANDBOX_MARKER')) throw Error('Opaque sandbox content captured with option off');
   if(content.includes('SYNTHETIC_PASSWORD')||content.includes('HIDDEN_MARKER')) throw Error('Hidden content or password leaked');
   if(!content.includes('NESTED_MARKER')||!content.includes('BELOW_MARKER')||!content.includes('SHADOW_MARKER')) throw Error('Missing nested, shadow or below-viewport content');
  }
  const flat=[];const visit=n=>{if(n.role==='embedded-document')flat.push({name:n.name,status:n.value});for(const c of n.children)visit(c);};visit(result.tree.root);
  summaries.push({frames:flat,warnings:result.warnings,frameAccess:result.frameAccess});
 }
 const cleaned=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:()=>globalThis.__copyAsContextFrames?.({mode:'verify',operation:'expired-probe',generation:'none'})===undefined});
 return JSON.stringify({summaries,dispatcherAvailable:cleaned[0].result});
 })()`));
 assert.equal(captures.error,undefined,JSON.stringify(captures));
 await protocol.send('webExtension.uninstall',{extension:original.browser_specific_settings.gecko.id});
 await writeFile(resolve(extensionPath,'manifest.json'),JSON.stringify({...manifest,host_permissions:['http://*/*','https://*/*']}));
 await protocol.send('webExtension.install',{extensionData:{type:'path',path:extensionPath}});
 ({context:probe}=await protocol.send('browsingContext.create',{type:'tab'}));
 await protocol.send('browsingContext.navigate',{context:probe,url:`moz-extension://${uuid}/probe.html`,wait:'complete'});
 const crossOrigin=JSON.parse(await evaluate(`(async()=>{
  const tab=(await browser.tabs.query({})).find(t=>t.url==='http://127.0.0.1:${port}/');
  const result=await FirefoxProbe.captureFirefoxPage(tab,'2026.10.11 12:00:00');
  if(!result.ok)return JSON.stringify({error:result.error});
  let captured=0;let skipped=0;const visit=n=>{if(n.role==='embedded-document'){if(n.value==='Captured')captured++;else skipped++;}for(const c of n.children)visit(c);};visit(result.tree.root);
  const content=FirefoxProbe.prepareExport(result.tree,'detailed','semantic-text',true).serialized.content;
  return JSON.stringify({captured,skipped,warnings:result.warnings??[],frameAccess:result.frameAccess??[],sandboxCaptured:content.includes('SANDBOX_MARKER')});
 })()`));
 assert.equal(crossOrigin.error,undefined,JSON.stringify(crossOrigin));
 assert.equal(crossOrigin.sandboxCaptured,true);assert.equal(crossOrigin.skipped,0);assert.deepEqual(crossOrigin.warnings,[]);assert.deepEqual(crossOrigin.frameAccess,[]);
 console.log(JSON.stringify({version:session.capabilities.browserVersion,temporaryHostGrants:true,hostGrantModes:['root-only','all-http-https'],productionActiveTabAndPromptVerified:false,rootOnlyCaptures:captures.summaries.length,crossOrigin,apiCases:result.results},null,2));
} finally { protocol?.close();const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true}); }
