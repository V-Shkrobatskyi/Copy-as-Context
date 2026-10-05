import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

async function javascript(directory) {
  const contents = await Promise.all((await readdir(directory, { withFileTypes: true })).map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascript(path);
    return entry.name.endsWith('.js') ? readFile(path, 'utf8') : '';
  }));
  return contents.join('\n');
}

for (const target of ['chrome', 'firefox']) {
  const firefox = target.startsWith('firefox');
  const build = `${target}-mv3`;
  const directory = new URL(`../.output/${build}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.action.default_popup);
  assert.ok(!manifest.host_permissions?.length);
  assert.ok(!manifest.content_scripts?.length);
  const source = await javascript(fileURLToPath(directory));
  assert.ok(!/\bimport\s*\(/u.test(await readFile(new URL('background.js', directory), 'utf8')), 'Background requires runtime dynamic imports');
  if (firefox) {
    assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'clipboardWrite', 'storage'].sort());
    assert.deepEqual(manifest.optional_permissions, ['downloads']);
    assert.ok(manifest.background.scripts?.length);
    assert.equal(manifest.background.service_worker, undefined);
    assert.ok(manifest.browser_specific_settings.gecko.id);
    assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
    assert.deepEqual(manifest.browser_specific_settings.gecko_android, { strict_min_version: '142.0' }, 'Incorrect Firefox target compatibility');
    assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
    assert.ok(!source.includes('Accessibility.getFullAXTree'), 'Firefox includes Chrome AX capture');
    assert.ok(!source.includes('debugger.attach'), 'Firefox includes debugger attach');
    const collector = await readFile(new URL('dom-capture.js', directory), 'utf8');
    assert.ok(collector.length > 0, 'Missing DOM capture script');
    assert.ok(!source.includes('Firefox page capture is not available'), 'Firefox still uses the capture placeholder');
    assert.ok(!/\bimport\s*\(/u.test(collector), 'DOM collector requires runtime dynamic imports');
    const fixture = new JSDOM('<title>Synthetic</title><main><h1>Settings</h1><button aria-label="Save settings">Save</button><label>Password<input type="password" value="synthetic-private-value"></label></main>', { url: 'https://example.test/', runScripts: 'outside-only' });
    try {
      let passwordReads = 0;
      Object.defineProperty(fixture.window.document.querySelector('input'), 'value', { get() { passwordReads++; throw new Error('Password read'); } });
      const result = fixture.window.eval(collector);
      assert.equal(result.ok, true, 'Injected bundle did not return capture data');
      assert.ok(JSON.stringify(result).includes('Save settings'), 'Built collector lost control names');
      assert.ok(!JSON.stringify(result).includes('synthetic-private-value'), 'Built collector leaked a password');
      assert.equal(passwordReads, 0);
      assert.equal(fixture.window.domCapture, undefined, 'Collector retains capture data globally');
    } finally { fixture.window.close(); }
  } else {
    assert.deepEqual([...manifest.permissions].sort(), ['debugger', 'clipboardWrite', 'downloads', 'storage'].sort());
    assert.ok(manifest.background.service_worker);
    assert.equal(manifest.browser_specific_settings, undefined);
    assert.ok(source.includes('Accessibility.getFullAXTree'), 'Chrome AX capture was removed');
    assert.ok(!source.includes('Firefox page capture is not available'), 'Chrome includes Firefox placeholder');
  }
  console.log(`${target}: manifest and bundled capture boundary verified`);
}
