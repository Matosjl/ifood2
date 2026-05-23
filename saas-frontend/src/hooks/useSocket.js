import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Auth errors — stop reconnecting immediately; session expired
const AUTH_ERRORS = new Set(['AUTH_REQUIRED', 'AUTH_INVALID']);

/**
 * Manages a Socket.io connection authenticated with the stored JWT.
 * Reconnects automatically; cleans up on unmount.
 *
 * @param {object} handlers
 *   onActiveOrders(orders[])  — snapshot sent on connect/reconnect
 *   onOrderCreated(order)     — new order arrived
 *   onOrderUpdated(order)     — status changed
 *   onOrderDeleted(id)        — order removed
 *   onReconnect()             — called after a successful reconnect (use to re-fetch)
 */
export default function useSocket({
  onActiveOrders,
  onOrderCreated,
  onOrderUpdated,
  onOrderDeleted,
  onReconnect,
}) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef({});

  // Keep handlers fresh without tearing down the socket on every render
  useEffect(() => {
    handlersRef.current = {
      onActiveOrders, onOrderCreated, onOrderUpdated, onOrderDeleted, onReconnect,
    };
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth:                 { token },
      transports:           ['websocket', 'polling'],
      reconnectionAttempts: Infinity,   // nunca desiste — atendente não precisa dar F5
      reconnectionDelay:    2_000,
      reconnectionDelayMax: 30_000,     // cap em 30s para não sobrecarregar
    });

    socket.on('connect', () => setConnected(true));

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err) => {
      console.warn('[Socket] erro de conexão:', err.message);
      // Token expirado ou inválido → para de reconectar; usuário precisa fazer login
      if (AUTH_ERRORS.has(err.message)) {
        console.warn('[Socket] sessão expirada — desconectando permanentemente');
        socket.disconnect();
      }
    });

    // Reconexão bem-sucedida → re-fetch REST para recuperar pedidos perdidos
    socket.on('reconnect', (attempt) => {
      console.info(`[Socket] reconectado após ${attempt} tentativa(s)`);
      handlersRef.current.onReconnect?.();
    });

    socket.on('orders:active', ({ data }) => handlersRef.current.onActiveOrders?.(data));
    socket.on('order:created', (order)   => handlersRef.current.onOrderCreated?.(order));
    socket.on('order:updated', (order)   => handlersRef.current.onOrderUpdated?.(order));
    socket.on('order:deleted', ({ id })  => handlersRef.current.onOrderDeleted?.(id));

    return () => { socket.disconnect(); setConnected(false); };
  }, []); // socket criado uma vez por mount

  return connected;
}
