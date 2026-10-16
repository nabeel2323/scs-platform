'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import { isMerchantRole } from './auth';
import { fetchMyStores } from './api';
import { onNewOrder, watchStore, type NewOrderEvent } from './realtime';

/**
 * Client-side merchant realtime wiring. When the signed-in user has a merchant
 * role, join each of their stores' rooms (`org:{storeId}`) and invoke
 * `onNewOrder` whenever a `new_order` broadcast arrives, so merchant screens can
 * refresh without polling.
 *
 * A store alert is org-scoped, not a personal notification, so we also fire the
 * global `unreadCountChanged` event the Navbar already listens for — that keeps
 * the bell badge truthful even though the new-order signal isn't itself one of
 * the user's notifications. (Checkout additionally persists a real in-app
 * notification per org member, which arrives over `notification.new`.)
 *
 * SSR- and logged-out-safe: does nothing until a merchant session exists, and
 * the callback is held in a ref so a changing handler identity never re-subscribes.
 */
export function useMerchantRealtime(onNewOrderCb?: (evt: NewOrderEvent) => void): void {
  const { user } = useAuth();
  const isMerchant = isMerchantRole(user?.role);

  const cbRef = useRef(onNewOrderCb);
  cbRef.current = onNewOrderCb;

  useEffect(() => {
    if (!user || !isMerchant) return;

    const off = onNewOrder((evt) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('unreadCountChanged'));
      }
      cbRef.current?.(evt);
    });

    let unsubs: Array<() => void> = [];
    let cancelled = false;
    fetchMyStores()
      .then((stores) => {
        if (cancelled) return;
        unsubs = stores.map((s) => watchStore(s.id));
      })
      .catch(() => {
        /* Not a merchant / fetch failed: nothing to watch. */
      });

    return () => {
      cancelled = true;
      off();
      unsubs.forEach((u) => u());
    };
    // Depend on the stable `user` context value (as the Navbar does) plus the
    // derived role, so a token refresh reconnecting the socket doesn't re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isMerchant]);
}
