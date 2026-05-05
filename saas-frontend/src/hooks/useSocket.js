import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Manages a Socket.io connection authenticated with the stored JWT.
 * Reconnects automatically; cleans up on unmount.
 *
 * @param {object} handlers
 *   onActiveOrders(orders[])  — snapshot sent on connect
 *   onOrderCreated(order)     — new order arrived
 *   onOrderUpdated(order)     — status changed
 *   onOrderDeleted(id)        — order removed
 */
export default function useSocket({
  onActiveOrders,
  onOrderCreated,
  onOrderUpdated,
  onOrderDeleted,
}) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef({});

  // Keep handlers fresh without tearing down the socket on every render
  useEffect(() => {
    handlersRef.current = { onActiveOrders, onOrderCreated, onOrderUpdated, onOrderDeleted };
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 12,
      reconnectionDelay:    2_000,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect',       ()       => setConnected(true));
    socket.on('disconnect',    ()       => setConnected(false));
    socket.on('connect_error', (err)    => console.warn('[Socket] erro:', err.message));

    socket.on('orders:active', ({ data }) => handlersRef.current.onActiveOrders?.(data));
    socket.on('order:created', (order)   => handlersRef.current.onOrderCreated?.(order));
    socket.on('order:updated', (order)   => handlersRef.current.onOrderUpdated?.(order));
    socket.on('order:deleted', ({ id })  => handlersRef.current.onOrderDeleted?.(id));

    return () => { socket.disconnect(); setConnected(false); };
  }, []); // socket created once per mount

  return connected;
}
