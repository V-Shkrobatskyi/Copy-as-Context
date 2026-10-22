// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
(() => {
  const storageKey = 'copy-as-context:theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const normalize = value => value === 'light' || value === 'dark' ? value : 'system';
  let preference = 'system';
  try { preference = normalize(localStorage.getItem(storageKey)); } catch { /* Keep the system default when storage is unavailable. */ }

  function apply() {
    document.documentElement.dataset.theme = preference === 'system'
      ? (systemTheme.matches ? 'dark' : 'light') : preference;
    document.querySelectorAll('[data-theme-picker]').forEach(picker => { picker.value = preference; });
  }
  apply();
  systemTheme.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      preference = normalize(event.newValue);
      apply();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-theme-picker]').forEach(picker => {
      picker.addEventListener('change', () => {
        preference = normalize(picker.value);
        apply();
        try { localStorage.setItem(storageKey, preference); } catch { /* Apply the selection for this page even if it cannot be saved. */ }
      });
    });
  });
})();
