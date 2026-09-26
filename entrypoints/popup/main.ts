import './style.css';

import type { CaptureResult, SemanticNode } from '@/src/core';
import { CAPTURE_ACTIVE_TAB_MESSAGE, type CaptureActiveTabRequest } from '@/src/capture-message';

const ERROR_MESSAGES: Record<string, string> = {
  'unsupported-page': 'This Chrome page cannot be captured. Open a regular web page and try again.',
  'permission-denied': 'Chrome denied access to this page.',
  'debugger-busy': 'Chrome debugging is already in use for this tab. Close DevTools and try again.',
  'invalid-tree': 'Chrome returned an invalid accessibility tree. Try again.',
  'capture-failed': 'Unable to capture the accessibility tree. Try again.',
};

function countNodes(node: SemanticNode): number {
  return 1 + node.children.reduce((count, child) => count + countNodes(child), 0);
}

function isCaptureResult(value: unknown): value is CaptureResult {
  return typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean';
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="popup" aria-labelledby="popup-title">
    <h1 id="popup-title">Copy as Context</h1>
    <p>Capture the semantic accessibility tree of the active Chrome tab.</p>
    <button class="capture-button" type="button">Capture page semantics</button>
    <p class="status" role="status" aria-live="polite"></p>
  </main>
`;

const button = document.querySelector<HTMLButtonElement>('.capture-button')!;
const status = document.querySelector<HTMLParagraphElement>('.status')!;

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Capturing accessibility tree…';

  try {
    const request: CaptureActiveTabRequest = { type: CAPTURE_ACTIVE_TAB_MESSAGE };
    const response = await chrome.runtime.sendMessage(request);
    if (!isCaptureResult(response)) {
      status.textContent = ERROR_MESSAGES['capture-failed'] ?? 'Unable to capture the accessibility tree.';
    } else if (response.ok) {
      const rootName = response.tree.root.name ? ` «${response.tree.root.name}»` : '';
      status.textContent = `Done: ${countNodes(response.tree.root)} semantic nodes. Root: ${response.tree.root.role}${rootName}.`;
    } else {
      status.textContent =
        ERROR_MESSAGES[response.error.code] ??
        ERROR_MESSAGES['capture-failed'] ??
        'Unable to capture the accessibility tree.';
    }
  } catch {
    status.textContent = ERROR_MESSAGES['capture-failed'] ?? 'Unable to capture the accessibility tree.';
  } finally {
    button.disabled = false;
  }
});
