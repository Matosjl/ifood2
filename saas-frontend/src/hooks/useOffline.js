/**
 * useOffline — detects network status and manages offline order queue.
 *
 * Offline queue: orders created while offline are stored in localStorage
 * under key `zapfome_offline_queue`. On reconnect, the hook tries to sync
 * them automatically via the normal orders API.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createOrder } from '../api/orders';

const QUEUE_KEY = 'zapfome_offline_queue';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queue,     setQueue]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); }
    catch { return []; }
  });
  const syncingRef = useRef(false);

  // ── Listen to browser online/offline events ────────────────
  useEffect(() => {
    const go_online  = () => setIsOffline(false);
    const go_offline = () => setIsOffline(true);
    window.addEventListener('online',  go_online);
    window.addEventListener('offline', go_offline);
    return () => {
      window.removeEventListener('online',  go_online);
      window.removeEventListener('offline', go_offline);
    };
  }, []);

  // ── Persist queue to localStorage ─────────────────────────
  const persistQueue = useCallback((q) => {
    setQueue(q);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* quota */ }
  }, []);

  // ── Add an order to the offline queue ─────────────────────
  const enqueueOfflineOrder = useCallback((orderPayload) => {
    const item = {
      id:        crypto.randomUUID(),
      payload:   orderPayload,
      queuedAt:  new Date().toISOString(),
      attempts:  0,
    };
    setQueue((prev) => {
      const next = [...prev, item];
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    return item.id;
  }, []);

  // ── Sync offline queue when back online ─────────────────────
  const syncOfflineQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const currentQueue = (() => {
      try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); }
      catch { return []; }
    })();
    if (currentQueue.length === 0) return;

    syncingRef.current = true;
    const remaining = [];

    for (const item of currentQueue) {
      try {
        await createOrder(item.payload);
        // success — don't re-add to remaining
      } catch {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }

    persistQueue(remaining);
    syncingRef.current = false;

    if (remaining.length < currentQueue.length) {
      const synced = currentQueue.length - remaining.length;
      window.dispatchEvent(new CustomEvent('offline:synced', { detail: { synced, remaining: remaining.length } }));
    }
  }, [persistQueue]);

  // ── Auto-sync on reconnect ─────────────────────────────────
  useEffect(() => {
    if (!isOffline && queue.length > 0) {
      syncOfflineQueue();
    }
  }, [isOffline, queue.length, syncOfflineQueue]);

  // ── Listen for SW sync message ─────────────────────────────
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type === 'SYNC_OFFLINE_ORDERS') syncOfflineQueue();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [syncOfflineQueue]);

  // ── Register Background Sync when going offline ────────────
  useEffect(() => {
    if (isOffline) return;
    navigator.serviceWorker?.ready
      .then((reg) => reg.sync?.register('sync-offline-orders'))
      .catch(() => {});
  }, [isOffline]);

  return {
    isOffline,
    offlineQueueLength: queue.length,
    enqueueOfflineOrder,
    syncOfflineQueue,
  };
}
