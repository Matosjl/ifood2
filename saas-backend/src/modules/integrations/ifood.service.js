// ── iFood Merchant API integration ───────────────────────────
// Docs: https://developer.ifood.com.br/reference
// Flow: auth → polling de eventos → ack → criar pedido no ZapFome → atualizar status

const axios = require('axios');
const db    = require('../../config/database');
const { createExternalOrder, updateStatus } = require('../orders/orders.service');

const IFOOD_API = 'https://merchant-api.ifood.com.br';

// ── Token cache por tenant ────────────────────────────────────

const tokenCache = new Map(); // tenantId → { accessToken, expiresAt }

const getToken = async (tenantId, clientId, clientSecret) => {
  const cached = tokenCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const params = new URLSearchParams({
    grantType:    'client_credentials',
    clientId,
    clientSecret,
  });

  const { data } = await axios.post(
    `${IFOOD_API}/authentication/v1.0/oauth/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );

  const token = data.accessToken;
  const expiresIn = data.expiresIn ?? 3600;
  tokenCache.set(tenantId, { accessToken: token, expiresAt: Date.now() + expiresIn * 1_000 });
  return token;
};

// ── Helpers de mapeamento ─────────────────────────────────────

const mapPayment = (ifoodPayments = []) => {
  const name = (ifoodPayments[0]?.name ?? '').toLowerCase();
  if (name.includes('pix'))     return 'pix';
  if (name.includes('cr'))      return 'credit';
  if (name.includes('d'))       return 'debit';
  if (name.includes('dinheiro') || name.includes('cash')) return 'cash';
  return 'other';
};

const mapDelivery = (ifoodOrder) =>
  (ifoodOrder.deliveryAddress ? 'delivery' : 'pickup');

const mapItems = (ifoodItems = []) =>
  ifoodItems.map((it) => ({
    name:      it.name ?? it.description ?? 'Item',
    quantity:  parseInt(it.quantity, 10) || 1,
    unitPrice: parseFloat(it.unitPrice ?? it.price ?? 0),
    total:     parseFloat(it.totalPrice ?? (it.unitPrice * it.quantity) ?? 0),
    notes:     (it.observations ?? it.garnishes ?? []).map(g => g.name).join(', ') || null,
  }));

// ── Sincronizar pedidos de um tenant ─────────────────────────

const syncTenant = async (tenant) => {
  const { id: tenantId, ifood_client_id: clientId, ifood_client_secret: clientSecret } = tenant;
  if (!clientId || !clientSecret) return;

  let token;
  try {
    token = await getToken(tenantId, clientId, clientSecret);
  } catch (err) {
    console.warn(`[iFood] Erro ao autenticar tenant ${tenantId}:`, err.message);
    return;
  }

  // Polling de eventos
  let events;
  try {
    const { data } = await axios.get(
      `${IFOOD_API}/order/v1.0/events:polling`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 }
    );
    events = data ?? [];
  } catch (err) {
    console.warn(`[iFood] Erro ao fazer polling tenant ${tenantId}:`, err.message);
    return;
  }

  if (!events.length) return;

  // Acknowledge — informa ao iFood que recebemos os eventos
  const ackIds = events.map((e) => ({ id: e.id }));
  axios.post(
    `${IFOOD_API}/order/v1.0/events/acknowledgment`,
    ackIds,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
  ).catch(() => {});

  for (const event of events) {
    const { code, orderId } = event;

    // Só processa eventos de novo pedido
    if (!['PLACED', 'CONFIRMED'].includes(code)) continue;
    if (!orderId) continue;

    // Busca detalhes do pedido
    let ifoodOrder;
    try {
      const { data } = await axios.get(
        `${IFOOD_API}/order/v1.0/orders/${orderId}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 }
      );
      ifoodOrder = data;
    } catch {
      continue;
    }

    try {
      const addr = ifoodOrder.deliveryAddress;
      const address = addr
        ? `${addr.streetName ?? ''}, ${addr.streetNumber ?? ''} — ${addr.neighborhood ?? ''}, ${addr.city ?? ''}`
        : null;

      // Guard: se o pedido iFood não tem itens, não cria pedido no ZapFome.
      const mappedItems = mapItems(ifoodOrder.items);
      if (mappedItems.length === 0) {
        console.warn(`[iFood] Pedido externo ignorado: sem itens (orderId=${orderId}, tenant=${tenantId})`);
        continue;
      }

      await createExternalOrder(tenantId, {
        externalId:      orderId,
        channel:         'ifood',
        customerName:    ifoodOrder.customer?.name     ?? 'Cliente iFood',
        customerPhone:   ifoodOrder.customer?.phone    ?? null,
        customerAddress: address,
        neighborhood:    addr?.neighborhood ?? null,
        deliveryType:    mapDelivery(ifoodOrder),
        paymentMethod:   mapPayment(ifoodOrder.payments),
        deliveryFee:     parseFloat(ifoodOrder.deliveryFee ?? 0),
        total:           parseFloat(ifoodOrder.totalPrice  ?? 0),
        notes:           ifoodOrder.observations ?? null,
        items:           mappedItems,
      });

      // Confirma recebimento ao iFood
      axios.post(
        `${IFOOD_API}/order/v1.0/orders/${orderId}/statuses/confirm`,
        {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
      ).catch(() => {});

    } catch (err) {
      if (err.code !== '23505') // ignora duplicatas
        console.warn(`[iFood] Erro ao criar pedido ${orderId}:`, err.message);
    }
  }
};

// ── Loop de polling ───────────────────────────────────────────

let pollingInterval = null;

const startPolling = async () => {
  if (pollingInterval) return;

  const run = async () => {
    try {
      const { rows } = await db.query(
        `SELECT id, ifood_client_id, ifood_client_secret
         FROM tenants
         WHERE ifood_client_id IS NOT NULL AND active = true`
      );
      await Promise.allSettled(rows.map(syncTenant));
    } catch (err) {
      console.warn('[iFood] Erro no polling global:', err.message);
    }
  };

  await run(); // executa imediatamente ao iniciar
  pollingInterval = setInterval(run, 30_000); // depois a cada 30s
};

const stopPolling = () => {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
};

module.exports = { startPolling, stopPolling, syncTenant };
