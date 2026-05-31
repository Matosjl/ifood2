/**
 * usePushNotifications
 * Gerencia a assinatura de Web Push Notifications.
 *
 * Estados:
 *   'unsupported'  — browser não suporta Push
 *   'denied'       — usuário bloqueou permissão
 *   'unsubscribed' — suportado, mas não inscrito
 *   'subscribed'   — inscrito e ativo
 *   'loading'      — operação em andamento
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

export function usePushNotifications() {
  const [state,   setState]   = useState('loading'); // loading|unsupported|denied|unsubscribed|subscribed
  const [devices, setDevices] = useState(0);
  const [error,   setError]   = useState(null);

  // Checa o estado atual ao montar
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    // Verifica se já tem subscription ativa
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setState('subscribed');
        // Sincroniza com o servidor
        const { data } = await api.get('/push/status').catch(() => ({ data: { data: {} } }));
        setDevices(data.data?.devices ?? 1);
      } else {
        setState('unsubscribed');
      }
    }).catch(() => setState('unsubscribed'));
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    setState('loading');
    try {
      // 1. Pede permissão ao usuário
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return false;
      }

      // 2. Busca chave VAPID pública do servidor
      const { data: keyRes } = await api.get('/push/vapid-key');
      const vapidPublicKey = keyRes.data?.publicKey;
      if (!vapidPublicKey) throw new Error('VAPID não configurado no servidor');

      // 3. Registra no PushManager
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // 4. Envia ao backend
      const deviceLabel = `${navigator.platform} · ${new Date().toLocaleDateString('pt-BR')}`;
      const { data } = await api.post('/push/subscribe', {
        subscription: subscription.toJSON(),
        deviceLabel,
      });
      setDevices(data.data?.devices ?? 1);
      setState('subscribed');
      return true;
    } catch (err) {
      setError(err.message);
      setState(Notification.permission === 'denied' ? 'denied' : 'unsubscribed');
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete('/push/subscribe', { data: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setState('unsubscribed');
      setDevices(0);
    } catch (err) {
      setError(err.message);
      setState('unsubscribed');
    }
  }, []);

  return { state, devices, error, subscribe, unsubscribe };
}

// Converte VAPID public key de Base64URL para Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
