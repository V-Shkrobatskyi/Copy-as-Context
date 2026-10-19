// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import './style.css';
import { browser } from 'wxt/browser';
import { BUILTIN_FILTERS, builtinCaseSensitive, customRuleFromBuiltin, RULE_TYPES, defaultRedactionSettings, exportRedactionSettings, importRedactionSettings, REDACTION_LIMITS, validateRedactionSettings, type CustomRedactionRule, type RuleType, type RedactionSettings } from '@/src/core/privacy/settings';
import { filterExample, testRedactionFilters, testRules } from '@/src/core/privacy/test-filters';
import { loadRedactionSettings, saveRedactionSettings } from '@/src/redaction-settings';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = get('status');
const fileInput = get<HTMLInputElement>('import-file');
let draft = defaultRedactionSettings();
let baseline: string | undefined;
let ready = false;
let modified = false;
let busy = true;
let disposed = false;
let leaving = false;
let downloadUrl: string | undefined;
let revokeTimer: ReturnType<typeof setTimeout> | undefined;

function feedback(message: string): void { status.textContent = message; get('save-feedback').textContent = message; }
function clearTestResult(): void {
  get<HTMLTextAreaElement>('test-output').value = '';
  get<HTMLInputElement>('test-label-output').value = '';
  get('test-label-result').hidden = true;
  get('test-count').textContent = '';
  get('test-matches').replaceChildren();
  get('test-match-results').hidden = true;
  get('example-feedback').textContent = '';
}
function refreshTestRules(): void {
  const select = get<HTMLSelectElement>('test-rule');
  const previous = select.value; select.replaceChildren();
  for (const source of ['builtin', 'custom'] as const) {
    const group = document.createElement('optgroup'); group.label = source === 'builtin' ? 'Built-in filters' : 'Custom filters';
    for (const item of testRules(draft).filter(item => item.source === source)) {
      const option = document.createElement('option'); option.value = item.key;
      option.textContent = `${item.rule.name || 'Unnamed filter'} — ${RULE_TYPES.find(type => type.id === item.rule.type)?.label ?? 'Text'}${item.rule.enabled ? '' : ' (off)'}`;
      group.append(option);
    }
    if (group.children.length) select.append(group);
  }
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}
function changed(): void {
  modified = baseline === undefined || JSON.stringify(draft) !== baseline;
  clearTestResult(); refreshTestRules();
  feedback(modified ? 'Changes are not saved yet.' : 'Filters match the saved settings.');
  updateControls();
}
function updateControls(): void {
  const blocked = busy || leaving;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>('button, input, textarea, select').forEach(control => { control.disabled = blocked || control.dataset.fixed === 'true'; });
  for (const id of ['save-filters', 'add-rule', 'test-filters', 'test-selected', 'load-example', 'load-near-miss', 'export-filters']) {
    get<HTMLButtonElement>(id).disabled = blocked || !ready;
  }
  get<HTMLButtonElement>('show-import').disabled = blocked;
  fileInput.disabled = blocked;
  get<HTMLSelectElement>('test-rule').disabled = blocked || !ready;
  get<HTMLButtonElement>('save-filters').disabled = blocked || !ready || !modified;
  get<HTMLButtonElement>('add-rule').disabled = blocked || !ready || draft.customRules.length >= REDACTION_LIMITS.rules;
  document.querySelectorAll<HTMLButtonElement>('[data-duplicate]').forEach(button => { button.disabled = blocked || !ready || draft.customRules.length >= REDACTION_LIMITS.rules; });
  get('dirty').textContent = modified ? 'Unsaved changes' : ready ? 'Saved filters' : '';
}

function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const wrapper = document.createElement('label'); wrapper.className = 'table-toggle'; wrapper.title = label;
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
  input.addEventListener('change', () => { onChange(input.checked); changed(); });
  const text = document.createElement('span'); text.className = 'sr-only'; text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}
function cell(row: HTMLTableRowElement, content: Node | string): HTMLTableCellElement {
  const td = document.createElement('td'); td.append(content); row.append(td); return td;
}
function ruleTypeSelect(rule: CustomRedactionRule, fixed = false): HTMLSelectElement {
  const select = document.createElement('select'); select.setAttribute('aria-label', `Rule type for ${rule.name || 'new filter'}`);
  for (const type of RULE_TYPES) {
    const option = document.createElement('option'); option.value = type.id; option.textContent = type.label;
    select.append(option);
  }
  select.value = rule.type!; select.title = RULE_TYPES.find(type => type.id === rule.type)!.description;
  if (fixed) select.dataset.fixed = 'true';
  else select.addEventListener('change', () => {
    rule.type = select.value as RuleType;
    select.title = RULE_TYPES.find(type => type.id === rule.type)!.description;
    changed();
  });
  return select;
}
function render(): void {
  const builtins = get('builtins'); builtins.replaceChildren();
  for (const filter of BUILTIN_FILTERS) {
    const row = document.createElement('tr'); row.className = 'builtin';
    cell(row, checkbox(`Enable ${filter.name}`, !draft.disabledBuiltins.includes(filter.id), enabled => {
      draft.disabledBuiltins = enabled ? draft.disabledBuiltins.filter(id => id !== filter.id) : [...draft.disabledBuiltins, filter.id];
    }));
    const name = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = filter.name;
    const type = document.createElement('small'); type.textContent = 'Built-in';
    name.append(title, type); cell(row, name);
    const text = document.createElement('code'); text.textContent = customRuleFromBuiltin(filter.id).text; text.title = filter.description;
    cell(row, text);
    cell(row, ruleTypeSelect(customRuleFromBuiltin(filter.id), true)).className = 'rule-type-value';
    cell(row, checkbox(`Case sensitive for ${filter.name}`, builtinCaseSensitive(draft, filter.id), value => {
      const overrides = { ...draft.builtinCaseSensitivity };
      if (value === filter.caseSensitive) delete overrides[filter.id];
      else overrides[filter.id] = value;
      if (Object.keys(overrides).length) draft.builtinCaseSensitivity = Object.fromEntries(
        BUILTIN_FILTERS.filter(item => overrides[item.id] !== undefined).map(item => [item.id, overrides[item.id]]));
      else delete draft.builtinCaseSensitivity;
    })).className = 'case-value';
    const duplicate = document.createElement('button'); duplicate.type = 'button'; duplicate.textContent = 'Duplicate'; duplicate.dataset.duplicate = 'true';
    duplicate.title = 'Create an editable custom copy of this built-in filter';
    duplicate.addEventListener('click', () => {
      if (busy || !ready || draft.customRules.length >= REDACTION_LIMITS.rules) return;
      const copy = customRuleFromBuiltin(filter.id, builtinCaseSensitive(draft, filter.id));
      copy.id = crypto.randomUUID(); copy.name = `${filter.name} copy`;
      draft.customRules.push(copy); changed(); render();
      get('custom-rules').querySelector<HTMLInputElement>('.custom-rule:last-child input[type="text"]')?.focus();
    });
    cell(row, duplicate).className = 'builtin-actions';
    builtins.append(row);
  }
  const rules = get('custom-rules'); rules.replaceChildren();
  for (const rule of draft.customRules) {
    const row = document.createElement('tr'); row.className = 'custom-rule';
    cell(row, checkbox('Enable this filter', rule.enabled, value => { rule.enabled = value; }));
    const name = document.createElement('input'); name.type = 'text'; name.value = rule.name;
    name.maxLength = REDACTION_LIMITS.name; name.placeholder = 'Filter name'; name.setAttribute('aria-label', 'Filter name');
    name.addEventListener('input', () => { rule.name = name.value; changed(); });
    cell(row, name);
    const text = document.createElement('textarea'); text.rows = 2; text.value = rule.text; text.spellcheck = false;
    text.maxLength = REDACTION_LIMITS.text; text.placeholder = 'Matching rule'; text.setAttribute('aria-label', 'Matching rule');
    text.addEventListener('input', () => { rule.text = text.value; changed(); });
    cell(row, text);
    cell(row, ruleTypeSelect(rule)).className = 'rule-type-value';
    cell(row, checkbox('Case sensitive for this filter', rule.caseSensitive, value => { rule.caseSensitive = value; })).className = 'case-value';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => { draft.customRules = draft.customRules.filter(item => item.id !== rule.id); changed(); render(); });
    cell(row, remove); rules.append(row);
  }
  get('empty-rules').hidden = draft.customRules.length > 0;
  clearTestResult(); refreshTestRules();
  updateControls();
}

async function load(): Promise<void> {
  busy = true; clearTestResult(); updateControls();
  try {
    const settings = await loadRedactionSettings();
    if (disposed) return;
    draft = settings; baseline = JSON.stringify(settings); ready = true; modified = false;
    feedback('Filters loaded.'); render();
  } catch {
    ready = false; baseline = undefined; modified = false; draft = defaultRedactionSettings();
    get('builtins').replaceChildren(); get('custom-rules').replaceChildren();
    feedback('Unable to load saved filters. Retry Reload saved, or restore defaults and save to replace them. Exports with redaction are blocked while saved filters cannot be read.');
  } finally { busy = false; updateControls(); }
}
get('reload-filters').addEventListener('click', () => {
  if (!busy && (!modified || window.confirm('Discard unsaved filter changes?'))) void load();
});
get('restore-defaults').addEventListener('click', () => {
  if (busy || !window.confirm('Restore all built-in filters and remove every custom rule? Choose Save filters to apply this change.')) return;
  draft = defaultRedactionSettings(); ready = true; changed(); render();
});
get('add-rule').addEventListener('click', () => {
  if (busy || !ready || draft.customRules.length >= REDACTION_LIMITS.rules) return;
  const rule: CustomRedactionRule = { id: crypto.randomUUID(), name: '', text: '', caseSensitive: false, enabled: true, type: 'text' };
  draft.customRules.push(rule); changed(); render();
  get('custom-rules').querySelector<HTMLInputElement>('.custom-rule:last-child input[type="text"]')?.focus();
});
get('save-filters').addEventListener('click', () => {
  if (busy || !ready || !modified) return;
  void (async () => {
    busy = true; updateControls();
    try {
      const settings = validateRedactionSettings(draft);
      if (baseline !== undefined && JSON.stringify(await loadRedactionSettings()) !== baseline) {
        feedback('Filters changed in another tab. Choose Reload saved before saving your changes.'); return;
      }
      await saveRedactionSettings(settings);
      draft = settings; baseline = JSON.stringify(settings); modified = false;
      render();
      feedback('Filters saved. They apply to your next export when Redact sensitive data is on.');
    } catch {
      feedback('Unable to save filters. Check names and non-blank matching rules (up to 256 characters each; 65,536 total). URL parameter rules need names only, without ?, &, =, # or line breaks. Reload saved if settings changed elsewhere.');
    } finally { busy = false; updateControls(); }
  })();
});
function runTest(selected: boolean): void {
  if (busy || !ready) return;
  clearTestResult();
  try {
    const label = get<HTMLInputElement>('test-field-label').value.trim();
    const sample = get<HTMLTextAreaElement>('test-input').value;
    const result = testRedactionFilters(draft, sample, label, selected ? get<HTMLSelectElement>('test-rule').value : undefined);
    get<HTMLTextAreaElement>('test-output').value = result.output;
    if (result.fieldLabel !== undefined) {
      get('test-label-result').hidden = false;
      get<HTMLInputElement>('test-label-output').value = result.fieldLabel;
    }
    get('test-count').textContent = `${result.redactionCount} replacement${result.redactionCount === 1 ? '' : 's'} · ${result.matches.length} matched rule${result.matches.length === 1 ? '' : 's'} · ${result.testedCount} rule${result.testedCount === 1 ? '' : 's'} tested${selected ? ' (selected only)' : ' (enabled only)'}.`;
    get('test-match-results').hidden = false;
    for (const match of result.matches) {
      const item = document.createElement('li');
      const type = RULE_TYPES.find(type => type.id === match.type)!.label;
      item.textContent = `${match.name} — ${match.source === 'builtin' ? 'Built-in' : 'Custom'} · ${type} · ${match.redactionCount} replacement${match.redactionCount === 1 ? '' : 's'} on its own`;
      get('test-matches').append(item);
    }
    if (!result.matches.length) {
      const item = document.createElement('li'); item.textContent = 'No rules matched this sample.'; get('test-matches').append(item);
    }
    feedback(selected ? 'Selected filter tested on its own, including if it is off. Nothing was saved or copied.' : 'Test complete. Nothing was saved or copied.');
  } catch { feedback('Complete the filters being tested. Use names and non-blank matching rules within the limits; URL parameter rules need names only. Test selected can check a completed rule while other rows are unfinished.'); }
}
get('test-filters').addEventListener('click', () => runTest(false));
get('test-selected').addEventListener('click', () => runTest(true));
for (const id of ['test-input', 'test-field-label']) get(id).addEventListener('input', clearTestResult);
get('test-rule').addEventListener('change', clearTestResult);
for (const [id, nearMiss] of [['load-example', false], ['load-near-miss', true]] as const) {
  get(id).addEventListener('click', () => {
    if (busy || !ready) return;
    clearTestResult();
    try {
      const key = get<HTMLSelectElement>('test-rule').value;
      const item = testRules(draft).find(item => item.key === key);
      if (!item) throw new Error('No filter selected');
      const example = filterExample(item, nearMiss);
      get<HTMLInputElement>('test-field-label').value = example.fieldLabel;
      get<HTMLTextAreaElement>('test-input').value = example.sample;
      const matched = testRedactionFilters(draft, example.sample, example.fieldLabel, key).matches.length > 0;
      get('example-feedback').textContent = nearMiss
        ? matched ? 'This near miss also matches your selected rule. Check whether another alternative covers it.' : 'Synthetic near miss loaded. Test selected should leave it unchanged; Test all may match other rules.'
        : matched ? 'Synthetic matching example loaded. Choose Test selected or Test all.' : 'Synthetic example loaded, but your selected rule does not match it. Check its terms and type requirements.';
    } catch { feedback('Complete the selected filter before loading an example. Other filters can remain unfinished.'); }
  });
}
get('show-import').addEventListener('click', () => {
  if (busy) return;
  try { fileInput.value = ''; fileInput.click(); }
  catch { feedback('Unable to open the file picker. Try again.'); }
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file || busy) return;
  if (file.size > REDACTION_LIMITS.json) { feedback('The filter file is too large. The limit is 256 KB.'); fileInput.value = ''; return; }
  busy = true; updateControls();
  void file.text().then(text => {
    if (disposed) return;
    let imported: RedactionSettings;
    try { imported = importRedactionSettings(text); }
    catch (error) { feedback(error instanceof Error ? error.message : 'Unable to import this filter file.'); return; }
    if (modified && !window.confirm('Replace your unsaved filter changes with this file?')) return;
    draft = imported; ready = true; changed(); render();
    feedback(modified ? 'Filters imported. Choose Save filters to apply them.' : 'Imported filters already match the saved settings.');
  }).catch(() => feedback('Unable to read this filter file. Choose a valid filter export and try again.'))
    .finally(() => { busy = false; fileInput.value = ''; updateControls(); });
});
function revokeDownload(): void {
  clearTimeout(revokeTimer);
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
}
get('export-filters').addEventListener('click', () => {
  if (busy || !ready) return;
  let text: string;
  try { text = exportRedactionSettings(draft); }
  catch { feedback('Complete each filter before exporting, and stay within the filter limits.'); return; }
  try {
    revokeDownload();
    downloadUrl = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = downloadUrl; link.download = 'copy-as-context-filters.json';
    document.body.append(link); link.click(); link.remove();
    revokeTimer = setTimeout(revokeDownload, 60_000);
    feedback('Download started: copy-as-context-filters.json. Includes built-in and custom filters from this table.');
  } catch { revokeDownload(); feedback('Unable to download filters. Try again or check your browser download settings.'); }
});
get('close-filters').addEventListener('click', () => {
  if (busy || leaving || (modified && !window.confirm('Discard unsaved filter changes and close this tab?'))) return;
  leaving = true; updateControls();
  void (async () => {
    try {
      const tab = await browser.tabs.getCurrent();
      if (tab?.id === undefined) throw new Error('tab-unavailable');
      await browser.tabs.remove(tab.id);
    } catch {
      leaving = false; updateControls();
      feedback('Unable to close this tab. Try again or close it using your browser.');
    }
  })();
});
window.addEventListener('beforeunload', event => { if (modified && !leaving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => {
  disposed = true; revokeDownload();
  get<HTMLTextAreaElement>('test-input').value = ''; clearTestResult();
  get<HTMLInputElement>('test-field-label').value = '';
});
window.addEventListener('pageshow', event => { if (event.persisted) { disposed = false; leaving = false; void load(); } });
void load();
