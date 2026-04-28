// iFood2 Push Notification Helper
const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

/**
 * Registra o Service Worker para push notifications.
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[Push] Service Worker não suportado neste navegador.");
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    console.log("[Push] Service Worker registrado:", registration.scope);
    return registration;
  } catch (err) {
    console.error("[Push] Falha ao registrar Service Worker:", err);
    return null;
  }
}

/**
 * Solicita permissão para notificações push.
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.warn("[Push] Notificações não suportadas.");
    return "denied";
  }
  const permission = await Notification.requestPermission();
  console.log("[Push] Permissão:", permission);
  return permission;
}

/**
 * Obtém a chave pública VAPID do backend.
 */
export async function getVapidPublicKey() {
  try {
    const res = await fetch(`${API}/push/vapid-public-key`);
    const data = await res.json();
    return data.publicKey;
  } catch (err) {
    console.error("[Push] Erro ao obter VAPID public key:", err);
    return "";
  }
}

/**
 * Converte Base64 URL-safe para Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData.split("").map((c) => c.charCodeAt(0)));
}

/**
 * Inscreve o usuário para notificações push.
 * @param {string} userType - 'cliente' | 'restaurante' | 'entregador'
 * @param {string} userId - ID ou telefone do usuário
 * @param {string} restauranteId - ID do restaurante (se userType='restaurante')
 */
export async function subscribePush(userType = "cliente", userId = null, restauranteId = null) {
  const registration = await registerServiceWorker();
  if (!registration) return false;

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return false;

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return false;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const payload = {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      userType,
      userId,
      restauranteId,
    };

    const res = await fetch(`${API}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log("[Push] Inscrição realizada com sucesso.");
      return true;
    }
    throw new Error("HTTP " + res.status);
  } catch (err) {
    console.error("[Push] Falha na inscrição:", err);
    return false;
  }
}

/**
 * Cancela a inscrição push.
 */
export async function unsubscribePush() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch(`${API}/push/unsubscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
        method: "DELETE",
      });
      await subscription.unsubscribe();
      console.log("[Push] Inscrição cancelada.");
    }
    return true;
  } catch (err) {
    console.error("[Push] Falha ao cancelar inscrição:", err);
    return false;
  }
}

/**
 * Retorna o status atual do push.
 */
export async function getPushStatus() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return { supported: false, subscribed: false, permission: "denied" };
  }
  const permission = Notification.permission;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      subscribed: !!subscription,
      permission,
      subscription,
    };
  } catch {
    return { supported: true, subscribed: false, permission };
  }
}

