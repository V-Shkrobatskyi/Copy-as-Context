// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

import './style.css';
import { readFilterDemoDraft } from '@/src/filter-demo-draft';
import { browser } from 'wxt/browser';
import { captureDomPage } from '@/src/adapters/dom/capture';
import { buildFilterDemo } from '@/src/core/privacy/demo';
import { RULE_TYPES, validateRedactionSettings, type RedactionSettings } from '@/src/core/privacy/settings';
import { loadRedactionSettings, REDACTION_SETTINGS_KEY } from '@/src/redaction-settings';
import { DEMO_CAPTURE } from '@/src/filter-demo-protocol';

const get = (id: string) => document.getElementById(id)!;
const session = /^#[a-zA-Z0-9_-]{1,64}$/u.test(location.hash) ? location.hash.slice(1) : '';
let current: RedactionSettings | undefined;
let revision = 0;
let disposed = false;
const navigationDraft = readFilterDemoDraft(session);
if (navigationDraft) {
  document.querySelector<HTMLAnchorElement>('.settings-link')!.href = `${browser.runtime.getURL('/filters.html')}#${session}`;
}
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function render(settings: RedactionSettings, draft: boolean): void {
  const demo = buildFilterDemo(settings);
  const fragment = document.createDocumentFragment();
  const groups = new Map<string, HTMLElement>();
  for (const [index, example] of demo.examples.entries()) {
    let samples = groups.get(example.ruleKey);
    if (!samples) {
      const card = document.createElement('section'); card.className = 'example';
      const header = document.createElement('header');
      const heading = document.createElement('h2'); heading.id = `rule-${index}`; heading.textContent = example.ruleName;
      card.setAttribute('aria-labelledby', heading.id);
      const kind = document.createElement('p'); kind.className = 'kind'; kind.textContent = RULE_TYPES.find(type => type.id === example.type)!.label;
      header.append(heading, kind);
      samples = document.createElement('div'); samples.className = 'samples';
      const columns = document.createElement('div'); columns.className = 'column-headings'; columns.setAttribute('aria-hidden', 'true');
      for (const text of ['ORIGINAL', 'WITH ENABLED FILTERS']) {
        const caption = document.createElement('span'); caption.className = 'caption'; caption.textContent = text; columns.append(caption);
      }
      samples.append(columns); card.append(header, samples); fragment.append(card); groups.set(example.ruleKey, samples);
    }
    const row = document.createElement('div'); row.className = 'sample-row';
    if (example.fieldLabel) {
      const label = document.createElement('label'); label.htmlFor = `sample-${index}`; label.textContent = example.fieldLabel;
      row.append(label);
    }
    const original = document.createElement('div'); original.className = 'sample-cell';
    const before = document.createElement('p'); before.className = 'caption mobile-caption'; before.textContent = 'ORIGINAL';
    original.append(before);
    if (example.fieldLabel) {
      const input = document.createElement('input'); input.id = `sample-${index}`; input.type = 'text'; input.readOnly = true; input.value = example.sample;
      original.append(input);
    } else {
      const sample = document.createElement(example.link ? 'a' : 'p'); sample.className = 'sample'; sample.textContent = example.sample;
      if (example.link) {
        // Generated query examples always use a non-routable example.test HTTPS URL.
        (sample as HTMLAnchorElement).href = example.sample;
        sample.addEventListener('click', event => event.preventDefault());
      }
      original.append(sample);
    }
    const filtered = document.createElement('div'); filtered.className = 'sample-cell';
    const after = document.createElement('p'); after.className = 'caption mobile-caption'; after.textContent = 'WITH ENABLED FILTERS';
    const output = document.createElement('output'); output.textContent = example.output;
    if (example.sample === example.output) output.className = 'unchanged';
    filtered.append(after, output); row.append(original, filtered); samples.append(row);
  }
  get('examples').replaceChildren(fragment);
  get('unavailable').replaceChildren(...demo.unavailable.map(item => { const li = document.createElement('li'); li.textContent = item.name; return li; }));
  get('unavailable-panel').hidden = demo.unavailable.length === 0;
  get('empty').hidden = demo.enabledCount !== 0;
  get('status').textContent = `${demo.enabledCount} enabled filters · ${demo.examples.length} examples · ${demo.redactionCount} replacements`;
  get('source').textContent = draft
    ? 'Using your filter draft. Customize filters returns to the same draft; other pages use saved filters. Save filters to apply your changes.'
    : 'Using saved filters. Customize filters to change these examples.';
}

async function refresh(): Promise<void> {
  const ticket = ++revision;
  current = undefined;
  try {
    const localDraft = session ? readFilterDemoDraft(session) : undefined;
    const draft = !!localDraft;
    const settings = localDraft
      ? validateRedactionSettings({ ...localDraft.settings, customRules: localDraft.settings.customRules.filter(rule => rule.enabled) })
      : await loadRedactionSettings();
    if (disposed || ticket !== revision) return;
    render(settings, draft); current = settings;
  } catch {
    if (disposed || ticket !== revision) return;
    current = undefined; get('examples').replaceChildren(); get('unavailable-panel').hidden = true; get('empty').hidden = true;
    get('status').textContent = 'Complete the enabled filters in Customize, or reload saved settings, to update this demo.';
    get('source').textContent = 'The demo cannot be captured until valid filters are available.';
  }
}
function queueRefresh(): void {
  if (disposed) return;
  current = undefined;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refresh(); }, 100);
}

const messageListener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, sender, sendResponse) => {
  if (disposed || sender.id !== browser.runtime.id) return;
  if (message?.type !== DEMO_CAPTURE || sender.tab || message.url !== location.href) return;
  void (async () => {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== message.tabId) return;
    await refresh();
    if (!current || disposed) { sendResponse({ error: 'invalid-demo' }); return; }
    sendResponse({ capture: captureDomPage(document), settings: current });
  })().catch(() => sendResponse({ error: 'capture-failed' }));
  return true;
};
const storageListener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => { if (area === 'local' && changes[REDACTION_SETTINGS_KEY]) queueRefresh(); };
browser.runtime.onMessage.addListener(messageListener);
browser.storage.onChanged.addListener(storageListener);
window.addEventListener('focus', queueRefresh);
window.addEventListener('pagehide', () => {
  disposed = true; revision++; clearTimeout(refreshTimer); current = undefined;
  browser.runtime.onMessage.removeListener(messageListener); browser.storage.onChanged.removeListener(storageListener);
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  disposed = false; browser.runtime.onMessage.addListener(messageListener); browser.storage.onChanged.addListener(storageListener); void refresh();
});
void refresh();
