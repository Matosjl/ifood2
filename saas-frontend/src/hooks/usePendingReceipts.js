import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getPendingReceipts } from '../api/receipts';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Lista de notas fiscais pendentes de confirmação + listener socket pra updates em tempo real.
 *
 * Eventos socket consumidos:
 *   - receipt:created    — nota nova chegou via WhatsApp ou upload
 *   - receipt:confirmed  — alguém confirmou (UI remove da lista)
 *   - receipt:rejected   — alguém rejeitou (UI remove da lista)
 */
export default function usePendingReceipts() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await getPendingReceipts();
      setItems(Array.isArray(data?.data) ? data.data : []);
      setError(null);
    } catch (err) {
      console.error('[usePendingReceipts] fetch error', err);
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Socket subscription
  const socketRef = useRef(null);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });
    socketRef.current = socket;

    socket.on('receipt:created', (pending) => {
      setItems((prev) => {
        const exists = prev.find((p) => p.id === pending.id);
        return exists ? prev : [pending, ...prev];
      });
    });

    socket.on('receipt:confirmed', (pending) => {
      setItems((prev) => prev.filter((p) => p.id !== pending.id));
    });

    socket.on('receipt:rejected', (pending) => {
      setItems((prev) => prev.filter((p) => p.id !== pending.id));
    });

    return () => { socket.disconnect(); };
  }, []);

  const removeLocal = useCallback((id) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { items, loading, error, refetch: fetchAll, removeLocal };
}
