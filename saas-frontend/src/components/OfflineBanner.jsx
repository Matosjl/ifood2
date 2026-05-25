/**
 * OfflineBanner — shows a sticky banner when the device is offline.
 * Disappears when back online (with a brief "back online" confirmation).
 */
import { useState, useEffect } from 'react';
import { useOffline } from '../hooks/useOffline';

export default function OfflineBanner() {
  const { isOffline, offlineQueueLength, syncOfflineQueue } = useOffline();
  const [justReconnected, setJustReconnected] = useState(false);
  const [syncedCount,     setSyncedCount]     = useState(0);

  // When coming back online, briefly show "reconnected" state
  useEffect(() => {
    if (!isOffline) {
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isOffline]);

  // Listen for sync events
  useEffect(() => {
    const onSynced = (e) => {
      if (e.detail?.synced > 0) setSyncedCount(e.detail.synced);
    };
    window.addEventListener('offline:synced', onSynced);
    return () => window.removeEventListener('offline:synced', onSynced);
  }, []);

  if (!isOffline && !justReconnected) return null;

  if (!isOffline && justReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center px-4 pt-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-green-600/90 backdrop-blur text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-green-500/30 animate-fade-in pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
          Conexão restaurada
          {syncedCount > 0 && (
            <span className="ml-1 opacity-80">· {syncedCount} pedido{syncedCount > 1 ? 's' : ''} sincronizado{syncedCount > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gray-900/95 backdrop-blur border-b border-orange-500/30 px-4 py-2.5 flex items-center justify-between gap-3 shadow-xl">
      <div className="flex items-center gap-2.5">
        {/* Pulsing offline dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
        </span>
        <div>
          <p className="text-xs font-bold text-orange-400 leading-tight">Modo Offline</p>
          <p className="text-[10px] text-gray-400 leading-tight">
            Sem conexão com a internet. Pedidos serão sincronizados ao reconectar.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {offlineQueueLength > 0 && (
          <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full font-semibold border border-orange-500/20">
            {offlineQueueLength} na fila
          </span>
        )}
        <button
          onClick={syncOfflineQueue}
          className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors font-semibold"
        >
          Tentar agora
        </button>
      </div>
    </div>
  );
}
