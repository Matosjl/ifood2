// ── NFC-e Service — integração com NFe.io ───────────────────
// Documentação: https://nfe.io/docs/api/
// Suporta NF-e modelo 55 (mercadorias) e NFC-e modelo 65 (consumidor)

const axios   = require('axios');
const db      = require('../../config/database');
const AppError = require('../../utils/AppError');

const NFE_IO_URL = 'https://api.nfe.io/v2';

// Mapeamento forma de pagamento ZapFome → NFe.io
const PAY_MAP = {
  cash:    'Money',
  pix:     'DigitalWallet',
  credit:  'Credit',
  debit:   'Debit',
  voucher: 'FoodVoucher',
  other:   'Others',
};

// ── Config ────────────────────────────────────────────────────

const getConfig = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT nfce_config FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return rows[0]?.nfce_config ?? null;
};

const saveConfig = async (tenantId, config) => {
  await db.query(
    `UPDATE tenants SET nfce_config = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [tenantId, JSON.stringify(config)]
  );
  return config;
};

// ── Emissão ───────────────────────────────────────────────────

const issueNfce = async (tenantId, orderId) => {
  const config = await getConfig(tenantId);
  if (!config?.apiKey || !config?.companyId) {
    throw new AppError(
      'NFC-e não configurado. Acesse Configurações → NFC-e e informe a API Key e o Company ID.',
      400
    );
  }

  // Busca o pedido com itens
  const Order = require('../../models/Order');
  const order = await Order.findById(orderId, tenantId);
  if (!order) throw new AppError('Pedido não encontrado.', 404);

  if (order.nfce_status === 'Issued') {
    throw new AppError('NFC-e já emitida para este pedido.', 409);
  }

  const items = (order.items ?? []).map((item, idx) => ({
    code:          String(idx + 1).padStart(3, '0'),
    description:   (item.product_name ?? 'Produto').substring(0, 120),
    quantity:      parseFloat(item.weight_kg) || parseInt(item.quantity, 10) || 1,
    unitOfMeasure: item.weight_kg ? 'KG' : 'UN',
    unitPrice:     parseFloat(item.unit_price) || 0,
    cfop:          config.cfop ?? '5102',          // Venda de mercadoria dentro do estado
    ncm:           config.defaultNcm ?? '21069090', // Preparações alimentícias diversas
  }));

  const total       = parseFloat(order.total) || 0;
  const paymentType = PAY_MAP[order.payment_method] ?? 'Money';

  const body = {
    consumer: {
      name:  order.customer_name?.substring(0, 60) || 'CONSUMIDOR',
      type:  'Individual',
    },
    items,
    payment: { type: paymentType, amount: total },
  };

  let nfData;
  try {
    const { data } = await axios.post(
      `${NFE_IO_URL}/companies/${config.companyId}/salesinvoices`,
      body,
      {
        headers: {
          Authorization: config.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
    nfData = data;
  } catch (err) {
    const msg = err.response?.data?.message
      ?? err.response?.data?.error
      ?? err.message
      ?? 'Erro ao comunicar com NFe.io';
    throw new AppError(`NFe.io: ${msg}`, err.response?.status ?? 502);
  }

  // Extrai campos da resposta NFe.io
  const nfceId     = nfData.id ?? null;
  const nfceStatus = nfData.flowStatus ?? 'IssuedWithErrors';
  const nfceKey    = nfData.accessKey  ?? null;
  const nfceNumber = nfData.number     != null ? String(nfData.number) : null;
  const nfcePdfUrl = (nfData.links ?? []).find((l) => l.rel === 'pdf')?.href ?? null;

  await db.query(
    `UPDATE orders
     SET nfce_id = $2, nfce_status = $3, nfce_key = $4,
         nfce_number = $5, nfce_url = $6, nfce_issued_at = NOW()
     WHERE id = $1 AND tenant_id = $7`,
    [orderId, nfceId, nfceStatus, nfceKey, nfceNumber, nfcePdfUrl, tenantId]
  );

  return { id: nfceId, status: nfceStatus, key: nfceKey, number: nfceNumber, pdfUrl: nfcePdfUrl };
};

// ── Consulta status ───────────────────────────────────────────

const checkNfce = async (tenantId, orderId) => {
  const { rows } = await db.query(
    `SELECT nfce_id, nfce_status, nfce_key, nfce_number, nfce_url
     FROM orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  );
  const row = rows[0];
  if (!row)          throw new AppError('Pedido não encontrado.', 404);
  if (!row.nfce_id)  throw new AppError('NFC-e ainda não emitida para este pedido.', 404);

  const config = await getConfig(tenantId);
  if (!config?.apiKey) throw new AppError('NFC-e não configurado.', 400);

  let nfData;
  try {
    const { data } = await axios.get(
      `${NFE_IO_URL}/companies/${config.companyId}/salesinvoices/${row.nfce_id}`,
      {
        headers: { Authorization: config.apiKey },
        timeout: 15_000,
      }
    );
    nfData = data;
  } catch (err) {
    // Retorna o que temos em cache sem lançar erro
    return {
      id:     row.nfce_id,
      status: row.nfce_status,
      key:    row.nfce_key,
      number: row.nfce_number,
      pdfUrl: row.nfce_url,
    };
  }

  const status  = nfData.flowStatus ?? row.nfce_status;
  const pdfUrl  = (nfData.links ?? []).find((l) => l.rel === 'pdf')?.href ?? row.nfce_url;

  await db.query(
    `UPDATE orders SET nfce_status = $2, nfce_url = $3 WHERE id = $1 AND tenant_id = $4`,
    [orderId, status, pdfUrl, tenantId]
  );

  return { id: row.nfce_id, status, key: row.nfce_key, number: row.nfce_number, pdfUrl };
};

module.exports = { getConfig, saveConfig, issueNfce, checkNfce };
