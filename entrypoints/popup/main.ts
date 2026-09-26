import './style.css';

import type { CaptureResult, SemanticNode } from '@/src/core';
import { CAPTURE_ACTIVE_TAB_MESSAGE, type CaptureActiveTabRequest } from '@/src/capture-message';

const ERROR_MESSAGES: Record<string, string> = {
  'unsupported-page': 'Цю сторінку Chrome неможливо захопити. Відкрийте звичайну вебсторінку.',
  'permission-denied': 'Chrome не надав доступ для захоплення цієї сторінки.',
  'debugger-busy': 'Налагодження цієї вкладки вже використовується. Закрийте DevTools і повторіть.',
  'invalid-tree': 'Chrome повернув некоректне accessibility-дерево. Спробуйте ще раз.',
  'capture-failed': 'Не вдалося захопити accessibility-дерево. Спробуйте ще раз.',
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
    <p>Захопіть семантичне accessibility-дерево активної вкладки Chrome.</p>
    <button class="capture-button" type="button">Capture page semantics</button>
    <p class="status" role="status" aria-live="polite"></p>
  </main>
`;

const button = document.querySelector<HTMLButtonElement>('.capture-button')!;
const status = document.querySelector<HTMLParagraphElement>('.status')!;

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Захоплення accessibility-дерева…';

  try {
    const request: CaptureActiveTabRequest = { type: CAPTURE_ACTIVE_TAB_MESSAGE };
    const response = await chrome.runtime.sendMessage(request);
    if (!isCaptureResult(response)) {
      status.textContent = ERROR_MESSAGES['capture-failed'] ?? 'Не вдалося захопити accessibility-дерево.';
    } else if (response.ok) {
      const rootName = response.tree.root.name ? ` «${response.tree.root.name}»` : '';
      status.textContent = `Готово: ${countNodes(response.tree.root)} semantic nodes, root ${response.tree.root.role}${rootName}.`;
    } else {
      status.textContent =
        ERROR_MESSAGES[response.error.code] ??
        ERROR_MESSAGES['capture-failed'] ??
        'Не вдалося захопити accessibility-дерево.';
    }
  } catch {
    status.textContent = ERROR_MESSAGES['capture-failed'] ?? 'Не вдалося захопити accessibility-дерево.';
  } finally {
    button.disabled = false;
  }
});
