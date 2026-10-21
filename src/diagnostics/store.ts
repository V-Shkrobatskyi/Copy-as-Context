// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import type { JournalState, JournalStore } from './journal';
/** Extension-origin IndexedDB is owned by background, never browser.storage shared with content scripts. */
export function localStateStore<T>(databaseName: string, key = 'state'): { load(): Promise<unknown>; save(state: T): Promise<void> } {
  const access = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let finished = false;
      const request = indexedDB.open(databaseName, 1);
      const fail = () => { finished = true; clearTimeout(timer); reject(new Error('Journal storage unavailable.')); };
      const timer = setTimeout(fail, 3000);
      request.onupgradeneeded = () => { if (finished) request.transaction?.abort(); else request.result.createObjectStore('state'); };
      request.onsuccess = () => { clearTimeout(timer); if (finished) request.result.close(); else { finished = true; resolve(request.result); } };
      request.onerror = request.onblocked = fail;
    });
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction('state', mode);
        const timer = setTimeout(() => { transaction.abort(); reject(new Error('Journal storage unavailable.')); }, 3000);
        const fail = () => { clearTimeout(timer); reject(new Error('Journal storage unavailable.')); };
        try {
          const request = action(transaction.objectStore('state'));
          transaction.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
          transaction.onerror = transaction.onabort = fail;
        } catch { clearTimeout(timer); transaction.abort(); fail(); }
      });
    } finally { db.close(); }
  };
  return { load: () => access('readonly', s => s.get(key)), save: async (s: T) => { await access('readwrite', store => store.put(s, key)); } };
}

export function journalStore(): JournalStore { return localStateStore<JournalState>('technical-journal-v1', 'journal'); }
