import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    beep(880, 0, 0.15);
    beep(1100, 0.18, 0.15);
    beep(880, 0.36, 0.2);
  } catch (_) {}
}

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [orders, setOrders] = useState([]);
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const flashTimer = useRef(null);
  const unacknowledgedRef = useRef(new Set());
  const soundIntervalRef = useRef(null);

  function startContinuousSound() {
    if (soundIntervalRef.current) return;
    soundIntervalRef.current = setInterval(() => {
      if (unacknowledgedRef.current.size > 0) {
        playAlert();
      } else {
        clearInterval(soundIntervalRef.current);
        soundIntervalRef.current = null;
      }
    }, 4000);
  }

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders`);
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const socket = io(BACKEND_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("novo_pedido", (order) => {
      playAlert();
      setOrders((prev) => [order, ...prev]);
      setNewOrderFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setNewOrderFlash(false), 3000);

      unacknowledgedRef.current.add(order.id);
      startContinuousSound();
    });

    socket.on("atualizar_status", ({ order_id, status }) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === order_id ? { ...o, status } : o))
      );
    });

    return () => {
      socket.disconnect();
      if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
    };
  }, [fetchOrders]);

  function updateStatus(orderId, status) {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
  }

  function acknowledgeOrder(orderId) {
    unacknowledgedRef.current.delete(orderId);
  }

  return { orders, connected, updateStatus, newOrderFlash, acknowledgeOrder };
}
