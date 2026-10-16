'use client';

import type { Store } from './api';

/**
 * Active-store preference (audit A2-1).
 *
 * Merchants can own several stores within one organization, but every merchant
 * page used to pin `stores[0]`, so the extra stores were unreachable in the UI.
 * The selection is kept in localStorage (not the JWT): it is a per-browser view
 * preference, whereas `activeOrg` is a server-issued token claim.
 */
const STORAGE_KEY = 'scs_active_store_id';

export function rememberStoreId(storeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, storeId);
  } catch {
    /* private mode / quota — the preference is non-essential */
  }
}

/**
 * The store a merchant page should operate on: the remembered one when it still
 * belongs to the caller's active organization, otherwise the newest store.
 */
export function pickStore(stores: Store[]): Store | undefined {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const remembered = saved ? stores.find((s) => s.id === saved) : undefined;
      if (remembered) return remembered;
    } catch {
      /* fall through to the default below */
    }
  }
  return stores[0];
}
