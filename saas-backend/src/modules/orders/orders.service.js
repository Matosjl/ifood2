const db           = require('../../config/database');
const Order        = require('../../models/Order');
const Product      = require('../../models/Product');
const Tenant       = require('../../models/Tenant');
const AppError     = require('../../utils/AppError');
const eventService = require('../../socket/eventService');
const orderCache   = require('../../cache/orderCache');
const { createLogger }   = require('../../utils/logger');
const { createIncident } = require('../incidents/incidents.service');

const logger = createLogger('orders.deductForOrder');

// ── Haversine (distância em km) — Guard D2 radius zones ────────
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R   = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a   = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Audit log helper ───────────────────────────────────────────
// Não-crítico: falha silenciosa para não bloquear operação principal.
const writeAuditLog = async (tenantId, orderId, userId, action, changes) => {
  try {
    await db.query(
      `INSERT INTO order_audit_logs (tenant_id, order_id, user_id, action, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, orderId, userId || null, action, JSON.stringify(changes)]
    );
  } catch (err) {
    console.error('[audit_log] falha ao registrar:', err.message);
  }
};

// ── Cashback helpers (compartilhados com public.controller) ───

/** Normaliza telefone: mantém apenas dígitos */
const normalizePhone = (phone) => (phone ?? '').replace(/\D/g, '').trim();

/**
 * Busca ou cria loyalty_customer pelo telefone.
 * Fire-and-forget safe: nunca lança.
 */
const upsertLoyaltyCustomer = async (tenantId, phone, name) => {
  const normPhone = normalizePhone(phone);
  if (!normPhone) return null;
  const { rows } = await db.query(
    `INSERT INTO loyalty_customers (tenant_id, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, phone) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, loyalty_customers.name), updated_at = NOW()
     RETURNING id, cashback_balance, total_orders, total_spent`,
    [tenantId, normPhone, name || null]
  );
  return rows[0] ?? null;
};

/**
 * Aplica cashback após criação de pedido manual.
 * Chamado fire-and-forget — nunca propaga erro.
 *
 * @param {string} tenantId
 * @param {string} orderId
 * @param {string|null} customerPhone
 * @param {string|null} customerName
 * @param {number} orderTotal
 * @param {number} cashbackUsed  — saldo que o cliente quis usar (0 por padrão)
 * @param {string|null} loyaltyCustomerId — pré-resolvido se o frontend enviou
 */
const applyManualOrderCashback = async (
  tenantId, orderId, customerPhone, customerName, orderTotal,
  cashbackUsed = 0, loyaltyCustomerId = null
) => {
  try {
    // 1. Busca config do tenant
    const { rows: cfg } = await db.query(
      `SELECT cashback_enabled, cashback_rate, cashback_min_order FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const config = cfg[0];
    if (!config?.cashback_enabled || !customerPhone) return;

    // 2. Upsert loyalty customer
    const loyalty = loyaltyCustomerId
      ? (await db.query(
          `SELECT id, cashback_balance FROM loyalty_customers WHERE id = $1`,
          [loyaltyCustomerId]
        )).rows[0]
      : await upsertLoyaltyCustomer(tenantId, customerPhone, customerName);

    if (!loyalty) return;

    // 3. Calcula cashback ganho
    const total    = parseFloat(orderTotal) || 0;
    const minOrder = parseFloat(config.cashback_min_order ?? 10);
    const earned   = total >= minOrder
      ? Math.round((total * parseFloat(config.cashback_rate) / 100) * 100) / 100
      : 0;

    // 4. Casha cashback usado (cap no saldo real disponível)
    const used = Math.min(
      parseFloat(cashbackUsed) || 0,
      parseFloat(loyalty.cashback_balance) || 0
    );

    // 5. Atualiza saldo e estatísticas do loyalty customer
    // GREATEST(0, ...) previne saldo negativo em caso de race condition
    await db.query(
      `UPDATE loyalty_customers
       SET cashback_balance = GREATEST(0, cashback_balance + $2 - $3),
           total_orders     = total_orders + 1,
           total_spent      = total_spent + $4,
           updated_at       = NOW()
       WHERE id = $1`,
      [loyalty.id, earned, used, total]
    );

    // 6. Registra transações de cashback
    const orderNum = (await db.query(`SELECT order_number FROM orders WHERE id = $1`, [orderId]))
      .rows[0]?.order_number ?? orderId;

    if (earned > 0) {
      await db.query(
        `INSERT INTO cashback_transactions (tenant_id, customer_id, order_id, type, amount, description)
         VALUES ($1,$2,$3,'earn',$4,$5)`,
        [tenantId, loyalty.id, orderId, earned,
          `Pedido #${orderNum} — cashback ${config.cashback_rate}%`]
      );
    }
    if (used > 0) {
      await db.query(
        `INSERT INTO cashback_transactions (tenant_id, customer_id, order_id, type, amount, description)
         VALUES ($1,$2,$3,'use',$4,$5)`,
        [tenantId, loyalty.id, orderId, used,
          `Cashback usado no Pedido #${orderNum}`]
      );
    }

    // 7. Vincula loyalty customer e valores ao pedido
    await db.query(
      `UPDATE orders
       SET loyalty_customer_id = $2, cashback_earned = $3, cashback_used = $4
       WHERE id = $1`,
      [orderId, loyalty.id, earned, used]
    );
  } catch (err) {
    // Cashback não é crítico — nunca deixa o pedido falhar
    const { createLogger } = require('../../utils/logger');
    createLogger('cashback').warn('Falha ao aplicar cashback em pedido manual', {
      orderId, tenantId, error: err.message
    });
  }
};

// ── Leitura ───────────────────────────────────────────────────

const listOrders = (tenantId, query) => Order.findAll(tenantId, query);

const getOrder = async (id, tenantId) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido nao encontrado.', 404);
  return order;
};

// ── Criacao ───────────────────────────────────────────────────

/**
 * Cria pedido com desconto atomico de estoque.
 *
 * @param {string} [initialStatus='pending']  - 'confirmed' para pedidos manuais
 * @param {string} [idempotencyKey]           - previne processamento duplo
 *
 * Idempotencia em duas camadas:
 *  1. Verificacao pre-transacao (fast path — evita trabalho redundante)
 *  2. Restricao UNIQUE no DB (captura requisicoes concorrentes com mesmo key)
 */
const VALID_PAYMENT_METHODS = ['cash', 'pix', 'credit', 'debit', 'fiado', 'voucher', 'pending', 'other', 'mixed'];

const createOrder = async (tenantId, {
  customerName, customerPhone, customerAddress,
  channel = 'manual', notes, items, deliveryType = 'pickup', paymentMethod = 'cash',
  deliveryFee = 0, neighborhood = null, initialStatus = 'pending', idempotencyKey,
  loyaltyCustomerId = null, cashbackUsed = 0, tableNumber = null,
  deliveryLat = null, deliveryLng = null,
  cashChangeFor = null,
  // Desconto aplicado pelo operador no PDV
  adjustmentType = null, adjustmentValue = 0,
  // Fiado legado (pagamento único — mantido para compatibilidade)
  fiadoClienteId = null,
  // Pagamento dividido: array de métodos/valores (PDV split payment)
  // Cada item: { method, amount, received_amount?, change_amount?, fiado_cliente_id? }
  payments = null,
  // Contexto do operador (injetados pelo controller, não vêm do cliente)
  userId = null,
  cashRegisterId = null,
  // Canal manual (atendente) enforça grupos required; online/externo preserva comportamento anterior.
  enforceRequiredVariation = false,
}) => {
  if (!items?.length) throw new AppError('O pedido deve ter pelo menos 1 item.', 400);

  // Camada 1: fast path — evita abrir transacao desnecessaria
  if (idempotencyKey) {
    const { rows: existing } = await db.query(
      `SELECT id FROM orders WHERE idempotency_key = $1 AND tenant_id = $2`,
      [idempotencyKey, tenantId]
    );
    if (existing[0]) return Order.findById(existing[0].id, tenantId);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Pre-carrega todos os produtos solicitados
    const productIds = [...new Set(items.map(i => i.productId))];
    const { rows: products } = await client.query(
      `SELECT id, name, sale_type, sale_price, stock_qty, active, cost_price, is_combo
       FROM products
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [productIds, tenantId]
    );
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // Carrega grupos de variação e opções escolhidas — servidor é a fonte de verdade de preço
    const allVariationOptionIds = items.flatMap(i => i.variationOptionIds ?? []).filter(Boolean);
    const variationOptionMap = {};  // optionId → { id, name, price, available, group_id, product_id }
    const varGroupsByProduct = {}; // productId → [{ id, name, required }]

    const { rows: varGroups } = await client.query(
      `SELECT id, product_id, name, required
       FROM product_variation_groups
       WHERE product_id = ANY($1::uuid[]) AND tenant_id = $2`,
      [productIds, tenantId]
    );
    for (const g of varGroups) {
      if (!varGroupsByProduct[g.product_id]) varGroupsByProduct[g.product_id] = [];
      varGroupsByProduct[g.product_id].push(g);
    }
    if (allVariationOptionIds.length > 0) {
      const { rows: varOpts } = await client.query(
        `SELECT pvo.id, pvo.name, pvo.price, pvo.available, pvo.group_id, pvg.product_id
         FROM product_variation_options pvo
         JOIN product_variation_groups pvg ON pvg.id = pvo.group_id
         WHERE pvo.id = ANY($1::uuid[]) AND pvo.tenant_id = $2`,
        [allVariationOptionIds, tenantId]
      );
      for (const opt of varOpts) variationOptionMap[opt.id] = opt;
    }

    // D2: valida deliveryFee contra delivery_zones do tenant (canal online/delivery).
    // Cobre dois tipos de zona: 'named' (por bairro) e 'radius' (por distância Haversine).
    if (deliveryType === 'delivery') {
      const { rows: tenantRows } = await client.query(
        `SELECT delivery_zones, delivery_zone_type, restaurant_lat, restaurant_lng
         FROM tenants WHERE id = $1`, [tenantId]
      );
      const tenantRow = tenantRows[0];
      const zones     = tenantRow?.delivery_zones;
      const zoneType  = tenantRow?.delivery_zone_type ?? 'named';

      if (Array.isArray(zones) && zones.length > 0) {
        if (zoneType === 'radius') {
          // ── Radius: valida por distância do restaurante ──────────
          const rLat = parseFloat(tenantRow.restaurant_lat);
          const rLng = parseFloat(tenantRow.restaurant_lng);
          const cLat = parseFloat(deliveryLat);
          const cLng = parseFloat(deliveryLng);

          // Radius exige coordenadas — sem elas não é possível calcular a zona correta
          if (isNaN(cLat) || isNaN(cLng)) {
            throw new AppError(
              'Endereço sem coordenadas válidas para cálculo da entrega. Confirme o endereço no mapa.',
              400
            );
          }
          if (isNaN(rLat) || isNaN(rLng)) {
            throw new AppError(
              'Restaurante sem localização configurada. Entre em contato com a loja.',
              400
            );
          }

          const dist   = haversineKm(rLat, rLng, cLat, cLng);
          const sorted = [...zones].sort((a, b) => (a.radius_km ?? 99) - (b.radius_km ?? 99));
          const zone   = sorted.find((z) => dist <= (z.radius_km ?? 99));

          if (!zone) {
            throw new AppError(
              'Endereço fora da área de entrega. Escolha outro endereço ou fale com a loja.',
              400
            );
          }

          const expectedFee = parseFloat(zone.fee) || 0;
          const sentFee     = parseFloat(deliveryFee) || 0;
          if (Math.abs(sentFee - expectedFee) > 0.50) {
            logger.warn('D2-radius: delivery_fee diverge da zona — corrigido', {
              tenantId, distKm: dist.toFixed(2), sent: sentFee, expected: expectedFee,
            });
            deliveryFee = expectedFee;
          }
        } else {
          // ── Named: valida por bairro/nome ───────────────────────
          if (neighborhood) {
            const zone = zones.find(
              (z) => z.name?.toLowerCase() === neighborhood?.toLowerCase()
            );
            if (zone) {
              const zoneFee = parseFloat(zone.fee) || 0;
              const sentFee = parseFloat(deliveryFee) || 0;
              if (Math.abs(sentFee - zoneFee) > 0.50) {
                logger.warn('D2-named: delivery_fee diverge da zona — corrigido', {
                  tenantId, neighborhood, sent: sentFee, zone: zoneFee,
                });
                deliveryFee = zoneFee;
              }
            }
          }
        }
      }
    }

    // Valida e calcula totais
    let orderTotal = parseFloat(deliveryFee) || 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) throw new AppError(`Produto ${item.productId} nao encontrado.`, 404);
      if (!product.active) throw new AppError(`Produto "${product.name}" esta inativo.`, 400);

      // Resolve variação — servidor valida e define o preço (cliente não é confiável)
      let variationLabel = null;
      let variationPrice = null;
      const varOptionIds   = item.variationOptionIds ?? [];
      const productVarGroups = varGroupsByProduct[item.productId] ?? [];

      for (const optId of varOptionIds) {
        const opt = variationOptionMap[optId];
        if (!opt || !opt.available)
          throw new AppError(`Opção de variação inválida ou indisponível.`, 400);
        if (String(opt.product_id) !== String(item.productId))
          throw new AppError(`Opção de variação não pertence ao produto "${product.name}".`, 400);
      }
      if (varOptionIds.length > 0) {
        const resolvedOpts = varOptionIds.map(id => variationOptionMap[id]);
        variationLabel = resolvedOpts.map(o => o.name).join(', ');
        variationPrice = resolvedOpts.reduce((s, o) => s + parseFloat(o.price), 0);
      }

      // Grupo required sem escolha → rejeita apenas no canal manual.
      // Online/externo preserva comportamento anterior (captura de variação via UI vem na Fase E1).
      if (enforceRequiredVariation) {
        const requiredGroups = productVarGroups.filter(g => g.required);
        if (requiredGroups.length > 0) {
          const chosenGroupIds = new Set(
            varOptionIds.map(id => variationOptionMap[id]?.group_id).filter(Boolean)
          );
          for (const rg of requiredGroups) {
            if (!chosenGroupIds.has(rg.id))
              throw new AppError(`Produto "${product.name}" exige a escolha de "${rg.name}".`, 400);
          }
        }
      }

      const effectiveUnitPrice = variationPrice !== null ? variationPrice : parseFloat(product.sale_price);

      let qty, lineTotal;
      if (product.sale_type === 'kg') {
        if (!item.weightKg || item.weightKg <= 0)
          throw new AppError(`Produto "${product.name}" e vendido por kg. Informe weightKg.`, 400);
        qty       = item.weightKg;
        lineTotal = effectiveUnitPrice * item.weightKg;
      } else {
        if (!item.quantity || item.quantity <= 0)
          throw new AppError(`Produto "${product.name}": quantity invalido.`, 400);
        qty       = item.quantity;
        lineTotal = effectiveUnitPrice * item.quantity;
      }

      // Soma preço dos complementos escolhidos
      const addonsTotal = (item.addons ?? []).reduce(
        (sum, a) => sum + (parseFloat(a.unit_price) || 0) * (a.qty || 1) * qty,
        0
      );
      lineTotal += addonsTotal;

      orderTotal += lineTotal;
      resolvedItems.push({ ...item, product, qty, lineTotal, variationLabel, variationPrice });
    }

    // Pré-carrega filhos de todos os combos presentes no pedido.
    // Feito fora da transação de estoque para falhar cedo com erro claro.
    const comboIds = [...new Set(
      resolvedItems.filter(i => i.product.is_combo).map(i => i.product.id)
    )];
    const comboItemsMap    = {};
    const comboOptionGrpMap = {}; // grupos de escolha por combo_product_id
    if (comboIds.length > 0) {
      const { getComboItems, getOptionGroups } = require('../combos/combos.service');
      for (const cid of comboIds) {
        const children = await getComboItems(tenantId, cid);
        if (children.length === 0) {
          const comboName = productMap[cid]?.name ?? cid;
          throw new AppError(
            `Combo "${comboName}" não tem itens cadastrados. Adicione itens ao combo antes de vender.`,
            400
          );
        }
        comboItemsMap[cid] = children;
        comboOptionGrpMap[cid] = await getOptionGroups(tenantId, cid);
      }
    }

    // Valida escolhas dos grupos de opção e acumula extra_price
    for (const item of resolvedItems) {
      if (!item.product.is_combo) continue;
      const groups  = comboOptionGrpMap[item.product.id] ?? [];
      const choices = item.choices ?? [];   // [{ group_id, product_id }]

      for (const group of groups) {
        const groupChoices = choices.filter((c) => c.group_id === group.id);
        if (groupChoices.length < group.min_select) {
          throw new AppError(
            `Grupo "${group.name}" exige no mínimo ${group.min_select} escolha(s) (selecionado: ${groupChoices.length}).`,
            400
          );
        }
        if (groupChoices.length > group.max_select) {
          throw new AppError(
            `Grupo "${group.name}" permite no máximo ${group.max_select} escolha(s) (selecionado: ${groupChoices.length}).`,
            400
          );
        }
        // Valida que cada produto escolhido existe no grupo
        for (const choice of groupChoices) {
          const validItem = group.items.find((i) => i.product_id === choice.product_id);
          if (!validItem) {
            throw new AppError(`Produto escolhido não pertence ao grupo "${group.name}".`, 400);
          }
          // Acumula extra_price no lineTotal do item
          const extra = parseFloat(validItem.extra_price) || 0;
          if (extra > 0) {
            item.lineTotal   += extra * item.qty;
            orderTotal        += extra * item.qty;
          }
          // Salva referência para uso posterior (stock + choices record)
          choice._validItem = validItem;
        }
      }
    }

    // Desconto atômico de estoque
    // Produtos normais: comportamento atual.
    // Combos: baixar filhos fixos + produtos das escolhas (option groups).
    for (const item of resolvedItems) {
      if (!item.product.is_combo) {
        await Product.deductStock(item.product.id, tenantId, item.qty, client);
      } else {
        // Filhos fixos
        const children = comboItemsMap[item.product.id];
        for (const child of children) {
          const childQty = parseFloat((parseFloat(child.qty) * item.qty).toFixed(3));
          await Product.deductStock(child.child_product_id, tenantId, childQty, client);
        }
        // Produtos escolhidos nos grupos de opção
        for (const choice of (item.choices ?? [])) {
          await Product.deductStock(choice.product_id, tenantId, item.qty, client);
        }
      }
    }

    // Desconto do operador (PDV) — aplicado após cálculo dos itens
    if (adjustmentType === 'discount' && parseFloat(adjustmentValue) > 0) {
      orderTotal = Math.max(0, orderTotal - parseFloat(adjustmentValue));
    }

    // ── Resolver pagamentos (split ou único) ──────────────────
    let resolvedPayments;
    let primaryPaymentMethod;

    if (Array.isArray(payments) && payments.length > 0) {
      // Normaliza campos snake_case / camelCase vindos do frontend
      const norm = payments.map(p => ({
        method:           p.method,
        amount:           parseFloat(p.amount) || 0,
        received_amount:  parseFloat(p.received_amount ?? p.receivedAmount) || null,
        change_amount:    parseFloat(p.change_amount   ?? p.changeAmount)   || null,
        fiado_cliente_id: p.fiado_cliente_id ?? p.fiadoClienteId ?? null,
      }));

      // Valida soma
      const paymentsSum = norm.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(paymentsSum - orderTotal) > 0.02) {
        throw new AppError(
          `Soma dos pagamentos (R$ ${paymentsSum.toFixed(2)}) não corresponde ao total do pedido (R$ ${orderTotal.toFixed(2)}).`,
          400
        );
      }

      // Valida cada parcela
      for (const p of norm) {
        if (!VALID_PAYMENT_METHODS.includes(p.method))
          throw new AppError(`Método de pagamento inválido: "${p.method}".`, 400);
        if (p.amount <= 0)
          throw new AppError('Cada parcela de pagamento deve ter valor > 0.', 400);
        if (p.method === 'fiado' && !p.fiado_cliente_id)
          throw new AppError('Pagamento fiado exige cliente (fiado_cliente_id).', 400);
      }

      resolvedPayments = norm;
      const methods = [...new Set(norm.map(p => p.method))];
      primaryPaymentMethod = methods.length === 1 ? methods[0] : 'mixed';

    } else {
      // Legado: pagamento único (sem payments[])
      primaryPaymentMethod = paymentMethod;
      resolvedPayments = [{
        method:           paymentMethod,
        amount:           orderTotal,
        received_amount:  cashChangeFor ? parseFloat(cashChangeFor) : null,
        change_amount:    cashChangeFor ? Math.max(0, parseFloat(cashChangeFor) - orderTotal) : null,
        fiado_cliente_id: fiadoClienteId || null,
      }];
    }

    const isSplitPayment = resolvedPayments.length > 1 ||
      (resolvedPayments.length === 1 && resolvedPayments[0].method !== paymentMethod);

    const orderNumber = await Order.nextOrderNumber(tenantId, client);

    const order = await Order.createOrder({
      tenantId, orderNumber,
      customerName, customerPhone, customerAddress,
      channel, total: parseFloat(orderTotal.toFixed(2)), notes,
      deliveryType,
      paymentMethod: primaryPaymentMethod,
      deliveryFee: parseFloat(deliveryFee) || 0,
      neighborhood: neighborhood || null,
      initialStatus, idempotencyKey,
      loyaltyCustomerId: loyaltyCustomerId || null,
      cashbackUsed: parseFloat(cashbackUsed) || 0,
      tableNumber: tableNumber || null,
      deliveryLat: deliveryLat || null,
      deliveryLng: deliveryLng || null,
      cashChangeFor: cashChangeFor ? parseFloat(cashChangeFor) : null,
      createdBy: userId || null,
    }, client);

    // Marca split se necessário (coluna informativa para UI)
    if (isSplitPayment) {
      await client.query(
        `UPDATE orders SET has_split_payment = true WHERE id = $1`,
        [order.id]
      );
    }

    for (const [lineNo, item] of resolvedItems.entries()) {
      // Custo unitário:
      //   Produto normal → cost_price do produto
      //   Combo → filhos fixos + custo dos produtos escolhidos nos grupos de opção
      let unitCost;
      if (!item.product.is_combo) {
        unitCost = parseFloat(item.product.cost_price) || 0;
      } else {
        const children = comboItemsMap[item.product.id];
        unitCost = children.reduce((s, c) => {
          return s + (parseFloat(c.cost_price) || 0) * parseFloat(c.qty);
        }, 0);
        // Soma custo dos produtos escolhidos (option groups)
        for (const choice of (item.choices ?? [])) {
          const vi = choice._validItem;
          if (vi) unitCost += parseFloat(vi.cost_price) || 0;
        }
        unitCost = parseFloat(unitCost.toFixed(4));
      }

      const soldQty   = item.product.sale_type === 'kg' ? (item.weightKg || 0) : (item.quantity || 1);
      const orderItem = await Order.createItem({
        orderId:        order.id,
        productId:      item.product.id,
        productName:    item.variationLabel
          ? `${item.product.name} (${item.variationLabel})`
          : item.product.name,
        quantity:       item.product.sale_type === 'unit' ? item.quantity : 1,
        weightKg:       item.product.sale_type === 'kg'   ? item.weightKg : null,
        unitPrice:      item.variationPrice !== null
          ? item.variationPrice
          : parseFloat(item.product.sale_price),
        total:          parseFloat(item.lineTotal.toFixed(2)),
        notes:          item.notes,
        unitCost,
        totalCost:      parseFloat((unitCost * soldQty).toFixed(2)),
        variationLabel: item.variationLabel,
        variationPrice: item.variationPrice,
        lineNo,
      }, client);

      // Grava escolhas dos grupos de opção (necessário para reverter insumos no cancelamento)
      if (orderItem?.id && item.product.is_combo && (item.choices ?? []).length > 0) {
        for (const choice of item.choices) {
          const vi = choice._validItem;
          if (!vi) continue;
          await client.query(
            `INSERT INTO order_item_combo_choices (order_item_id, group_id, product_id, extra_price)
             VALUES ($1, $2, $3, $4)`,
            [orderItem.id, choice.group_id, choice.product_id, parseFloat(vi.extra_price) || 0]
          );
        }
      }

      // Salva complementos selecionados para este item
      if (item.addons?.length && orderItem?.id) {
        for (const a of item.addons) {
          await client.query(
            `INSERT INTO order_item_addons (order_item_id, addon_item_id, addon_name, qty, unit_price, total)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              orderItem.id,
              a.addon_item_id || null,
              a.addon_name,
              a.qty || 1,
              parseFloat(a.unit_price) || 0,
              parseFloat(a.total) || 0,
            ]
          );
        }
      }

      await Product.createMovement({
        tenantId,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    -item.qty,
        type:        'out',
        reason:      `Pedido #${orderNumber}`,
        orderId:     order.id,
      }, client);
    }

    // ── order_payments: um registro por método, dentro da transação ──
    for (const p of resolvedPayments) {
      await client.query(
        `INSERT INTO order_payments
           (tenant_id, order_id, cash_register_id, method, amount,
            received_amount, change_amount, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          order.id,
          cashRegisterId || null,
          p.method,
          parseFloat(p.amount.toFixed(2)),
          p.received_amount ? parseFloat(p.received_amount) : null,
          p.change_amount   ? parseFloat(p.change_amount)   : null,
          userId || null,
        ]
      );
    }

    // ── fiado_compras: uma por parcela fiada — dentro da transação ──
    for (const p of resolvedPayments) {
      if (p.method !== 'fiado' || !p.fiado_cliente_id) continue;
      const { rows: fiadoCli } = await client.query(
        `SELECT bloqueado FROM fiado_clientes WHERE id = $1 AND tenant_id = $2`,
        [p.fiado_cliente_id, tenantId]
      );
      if (!fiadoCli[0]) throw new AppError('Cliente fiado não encontrado.', 404);
      if (fiadoCli[0].bloqueado) throw new AppError('Cliente bloqueado para compras fiadas.', 403);
      await client.query(
        `INSERT INTO fiado_compras (tenant_id, cliente_id, order_id, descricao, valor, tipo)
         VALUES ($1, $2, $3, $4, $5, 'compra')`,
        [
          tenantId,
          p.fiado_cliente_id,
          order.id,
          `Compra fiada — Pedido #${orderNumber}`,
          parseFloat(p.amount.toFixed(2)),
        ]
      );
    }

    // Auto-set paid_at para pedidos PDV confirmados sem pagamento diferido
    const DEFERRED_METHODS = new Set(['fiado', 'pending']);
    if (initialStatus === 'confirmed' && resolvedPayments.every(p => !DEFERRED_METHODS.has(p.method))) {
      await client.query(`UPDATE orders SET paid_at = NOW() WHERE id = $1`, [order.id]);
    }

    await client.query('COMMIT');

    // Incrementa contador mensal de pedidos (fire-and-forget)
    Tenant.incrementOrderCount(tenantId).catch(() => {});

    const createdOrder = await Order.findById(order.id, tenantId);

    // Deduz insumos se pedido já nasce confirmado (pedido manual)
    if (initialStatus === 'confirmed') {
      const insumosSvc = require('../insumos/insumos.service');
      insumosSvc.deductForOrder(tenantId, createdOrder.id).catch((err) => {
        logger.error('Falha ao deduzir insumos na criação do pedido', {
          err: err.message,
          tenantId,
          orderId: createdOrder.id,
          scope: 'createOrder',
        });
        createIncident(tenantId, {
          type:        'inventory_deduction_failed',
          orderId:     createdOrder.id,
          cost:        0,
          description: `Dedução de insumos falhou na criação do pedido: ${err.message}`,
          source:      'auto',
        }).catch(() => {}); // incidente é melhor-esforço, não pode quebrar o fluxo
      });
    }

    // Fase 2 — Aprende endereço do cliente após cada pedido (fire-and-forget)
    // Faz UPSERT em tenant_clients: cria se novo, atualiza address/coords se existir.
    // Condição: delivery com telefone e pelo menos endereço textual ou GPS.
    if (customerPhone && deliveryType === 'delivery' && (customerAddress || (deliveryLat && deliveryLng))) {
      const normPhone = normalizePhone(customerPhone);
      const newCoords = (deliveryLat && deliveryLng)
        ? JSON.stringify({ lat: parseFloat(deliveryLat), lng: parseFloat(deliveryLng) })
        : null;
      // UPDATE apenas — compara por dígitos para lidar com qualquer formatação armazenada.
      // Não faz INSERT: clientes novos são criados pelo modal (createCustomer).
      // COALESCE preserva valor existente quando novo é null.
      db.query(
        `UPDATE tenant_clients
         SET address    = COALESCE($3, address),
             coords     = COALESCE($4::jsonb, coords),
             name       = COALESCE($2, name),
             updated_at = NOW()
         WHERE tenant_id = $1
           AND regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') = $5
           AND $5 <> ''`,
        [tenantId, customerName || null, customerAddress || null, newCoords, normPhone]
      ).catch(() => {});
    }

    // Aplica cashback para pedidos manuais (fire-and-forget)
    if (customerPhone) {
      applyManualOrderCashback(
        tenantId, createdOrder.id,
        customerPhone, customerName,
        createdOrder.total,
        parseFloat(cashbackUsed) || 0,
        loyaltyCustomerId || null
      ).catch(() => {});
    }

    // Alerta de estoque baixo — verifica produtos que caíram abaixo do threshold (fire-and-forget)
    {
      const productIds = resolvedItems.map((i) => i.product.id);
      db.query(
        `SELECT id, name, sale_type, stock_qty, alert_threshold
         FROM products
         WHERE id = ANY($1::uuid[])
           AND tenant_id = $2
           AND alert_threshold > 0
           AND stock_qty <= alert_threshold
           AND stock_qty >= 0`,
        [productIds, tenantId]
      ).then(({ rows: lowStock }) => {
        if (lowStock.length > 0) {
          const waNotify = require('../../services/waNotify.service');
          waNotify.sendStockAlert(tenantId, lowStock).catch(() => {});
        }
      }).catch(() => {});
    }

    return createdOrder;

  } catch (err) {
    await client.query('ROLLBACK');

    // Camada 2: requisicao concorrente com mesmo idempotencyKey chegou primeiro
    if (err.code === '23505' && idempotencyKey) {
      const { rows } = await db.query(
        `SELECT id FROM orders WHERE idempotency_key = $1 AND tenant_id = $2`,
        [idempotencyKey, tenantId]
      );
      if (rows[0]) return Order.findById(rows[0].id, tenantId);
    }

    throw err;
  } finally {
    client.release();
  }
};

// ── External order (iFood, Rappi, etc.) ──────────────────────
// Cria pedido com items em formato livre (sem productId / sem estoque)
const createExternalOrder = async (tenantId, {
  externalId, channel = 'ifood',
  customerName, customerPhone, customerAddress, neighborhood,
  notes, items, deliveryType = 'delivery', paymentMethod = 'pix',
  deliveryFee = 0, total,
}) => {
  // Guard: nenhum pedido externo pode ser criado sem itens válidos.
  // Item válido = objeto com nome não-vazio. Rejeita [], undefined, [null], [{}].
  const validItems = Array.isArray(items)
    ? items.filter((it) => it && String(it.name ?? '').trim() !== '')
    : [];
  if (validItems.length === 0) {
    throw new AppError('Pedido externo ignorado: sem itens válidos.', 400);
  }

  // Idempotência: se já existe, retorna existente
  const { rows: existing } = await db.query(
    `SELECT id FROM orders WHERE external_id = $1 AND tenant_id = $2`,
    [externalId, tenantId]
  );
  if (existing[0]) return Order.findById(existing[0].id, tenantId);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const orderNumber = await Order.nextOrderNumber(tenantId, client);

    const order = await Order.createOrder({
      tenantId, orderNumber,
      customerName, customerPhone, customerAddress,
      channel, total: parseFloat(total) || 0, notes,
      deliveryType, paymentMethod,
      deliveryFee: parseFloat(deliveryFee) || 0,
      neighborhood: neighborhood || null,
      initialStatus: 'pending',
      idempotencyKey: null,
      loyaltyCustomerId: null,
      cashbackUsed: 0,
    }, client);

    // Grava external_id
    await client.query(
      `UPDATE orders SET external_id = $2 WHERE id = $1`,
      [order.id, externalId]
    );

    // Pré-carrega catálogo para tentar match de custo por nome
    // Normaliza: minúsculas, sem acentos, sem espaços duplos
    const { rows: catalog } = await client.query(
      `SELECT id, name, cost_price FROM products
       WHERE tenant_id = $1 AND active = true AND cost_price > 0`,
      [tenantId]
    );
    const normalize = (s) => (s ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();

    const findCost = (itemName) => {
      const needle = normalize(itemName);
      // 1. Match exato
      let p = catalog.find((c) => normalize(c.name) === needle);
      // 2. Match por inclusão (nome do catálogo contido no item ou vice-versa)
      if (!p) p = catalog.find((c) => {
        const cn = normalize(c.name);
        return needle.includes(cn) || cn.includes(needle);
      });
      return p ? parseFloat(p.cost_price) : 0;
    };

    for (const [lineNo, item] of validItems.entries()) {
      const qty      = parseInt(item.quantity, 10) || 1;
      const unitCost = findCost(item.name ?? '');
      await Order.createItem({
        orderId:     order.id,
        productId:   null,
        productName: String(item.name ?? 'Item').substring(0, 200),
        quantity:    qty,
        weightKg:    null,
        unitPrice:   parseFloat(item.unitPrice) || 0,
        total:       parseFloat(item.total ?? item.unitPrice * qty) || 0,
        notes:       item.notes ?? null,
        unitCost,
        totalCost:   parseFloat((unitCost * qty).toFixed(2)),
        lineNo,
      }, client);
    }

    await client.query('COMMIT');

    Tenant.incrementOrderCount(tenantId).catch(() => {});
    const createdOrder = await Order.findById(order.id, tenantId);
    eventService.orderCreated(tenantId, createdOrder);
    orderCache.upsertOrder(tenantId, createdOrder).catch(() => {});
    return createdOrder;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Status ────────────────────────────────────────────────────

const updateStatus = async (id, tenantId, status, userId = null) => {
  // Captura status anterior para o audit_log (query leve — usa índice primário)
  const { rows: prev } = await db.query(
    `SELECT status FROM orders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]
  );
  const previousStatus = prev[0]?.status ?? null;

  await Order.updateStatus(id, tenantId, status);
  // findById retorna o pedido completo (com items + payments) para que o socket
  // emita um payload hidratado — evita que o card fique em branco no Kanban.
  const updatedOrder = await Order.findById(id, tenantId);

  // Audit log de mudança de status (fora de transaction — falha silenciosa)
  writeAuditLog(tenantId, id, userId, 'status_changed', {
    from: previousStatus,
    to:   status,
  });

  // Sincroniza cache Redis imediatamente — remove pedidos terminais (delivered/cancelled)
  // para que reconexão do socket não ressuscite pedidos já concluídos.
  orderCache.upsertOrder(tenantId, updatedOrder).catch(() => {});

  // ── WhatsApp ao CLIENTE em cada mudança de status ─────────────
  // confirmed / preparing / ready / delivering → mensagem automática
  const waNotify = require('../../services/waNotify.service');
  waNotify.notifyCustomer(tenantId, updatedOrder).catch(() => {});

  // Deduz insumos quando pedido é confirmado ou vai direto para preparing (atalho pending→preparing)
  if (status === 'confirmed' || status === 'preparing') {
    const insumosSvc = require('../insumos/insumos.service');
    insumosSvc.deductForOrder(tenantId, id).catch((err) => {
      logger.error('Falha ao deduzir insumos na atualização de status', {
        err: err.message,
        tenantId,
        orderId: id,
        scope: 'updateOrderStatus',
      });
      createIncident(tenantId, {
        type:        'inventory_deduction_failed',
        orderId:     id,
        cost:        0,
        description: `Dedução de insumos falhou ao confirmar pedido: ${err.message}`,
        source:      'auto',
      }).catch(() => {}); // incidente é melhor-esforço, não pode quebrar o fluxo
    });
  }

  // When an order is ready for delivery, notify connected drivers
  if (status === 'ready' && updatedOrder?.delivery_type === 'delivery') {
    eventService.newDeliveryAvailable(tenantId, updatedOrder).catch(() => {});
  }

  // When delivered: create rating token + send WhatsApp (fire-and-forget)
  if (status === 'delivered') {
    const ratingSvc = require('../ratings/ratings.service');
    ratingSvc.createRatingRequest(tenantId, id).then(async (token) => {
      if (!token) return;
      // Send WhatsApp if customer has phone
      const phone = updatedOrder?.customer_phone;
      if (!phone) return;
      const baseUrl = process.env.FRONTEND_URL ?? 'https://zapfome.ddns.net';
      const url = `${baseUrl}/avaliar/${token}`;
      const msg = `Olá${updatedOrder.customer_name ? ` ${updatedOrder.customer_name}` : ''}! 😊 Como foi seu pedido #${updatedOrder.order_number ?? ''}? Avalie em 5 segundos: ${url}`;
      const { sendMessage } = require('../../services/whatsapp.service');
      sendMessage(tenantId, phone, msg).catch(() => {});
    }).catch(() => {});
  }

  return updatedOrder;
};

/**
 * Cancela o pedido e devolve estoque se ja estava em producao.
 * Se insumos_deducted = true, reverte também os insumos (inclui filhos de combos).
 * @param {string|null} reason  - Motivo do cancelamento (obrigatório)
 * @param {string|null} userId  - Usuário que cancelou (para audit trail)
 */
const cancelOrder = async (id, tenantId, reason = null, userId = null) => {
  if (!reason?.trim()) {
    throw new AppError('Motivo do cancelamento é obrigatório.', 400);
  }

  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido nao encontrado.', 404);

  // Bloqueia cancelamento de pedido já pago — necessário registrar estorno primeiro
  if (order.paid_at) {
    throw new AppError(
      'Este pedido já possui pagamento registrado. Para cancelar, é necessário registrar estorno/ajuste financeiro.',
      400
    );
  }

  await Order.updateStatus(id, tenantId, 'cancelled', reason);

  // Salva cancelled_by e cancelled_at
  await db.query(
    `UPDATE orders SET cancelled_by = $2, cancelled_at = NOW() WHERE id = $1`,
    [id, userId || null]
  );

  if (!['delivered', 'cancelled'].includes(order.status)) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const item of (order.items || [])) {
        if (!item.product_id) continue;
        const qty = item.weight_kg || item.quantity;
        await Product.addStock(item.product_id, tenantId, qty, client);
        await Product.createMovement({
          tenantId,
          productId:   item.product_id,
          productName: item.product_name,
          quantity:    qty,
          type:        'in',
          reason:      `Cancelamento do pedido #${order.order_number}`,
          orderId:     id,
        }, client);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Reverte insumos se foram debitados — essencial para combos cujos filhos
    // debitam insumos.qty_in_stock, não products.stock_qty
    if (order.insumos_deducted) {
      const { revertForOrder } = require('../insumos/insumos.service');
      await revertForOrder(tenantId, id);
    }
  }

  // Pedido completo (com items) após todos os updates — evita card em branco no Kanban
  const updated = await Order.findById(id, tenantId);

  // Remove do cache Redis (status = cancelled → hdel automático via upsertOrder)
  orderCache.upsertOrder(tenantId, updated).catch(() => {});

  // Audit log
  writeAuditLog(tenantId, id, userId, 'cancelled', {
    previous_status: order.status,
    reason: reason.trim(),
  });

  return updated;
};

// ── Pagamento ─────────────────────────────────────────────────

/**
 * Registra o pagamento de um pedido (payment_method + paid_at).
 * Aceita qualquer forma exceto 'pending' (que significa "ainda não pago").
 */
const markAsPaid = async (id, tenantId, paymentMethod) => {
  await Order.markAsPaid(id, tenantId, paymentMethod);
  return Order.findById(id, tenantId);
};

// ── Edição de itens ───────────────────────────────────────────

// Tipos que NÃO cobram taxa — nunca aceitar delivery_fee > 0 para eles.
const NON_DELIVERY_TYPES = new Set(['pickup', 'balcao', 'mesa', 'comanda', 'table']);

/**
 * Substitui os itens de um pedido ainda editável (pending/confirmed/preparing).
 * Devolve o estoque dos itens antigos e desconta o dos novos.
 * Atualiza order.total.
 */
const editOrderItems = async (id, tenantId, newItemsPayload, userId = null, deliveryOverride = null) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido não encontrado.', 404);

  const editableStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
  if (!editableStatuses.includes(order.status)) {
    throw new AppError(
      `Itens só podem ser editados em pedidos Pendentes, Em Preparo ou Prontos (status atual: ${order.status}).`,
      400
    );
  }
  if (order.paid_at) {
    throw new AppError(
      'Este pedido já está pago. Para alterar valor, é necessário fazer ajuste financeiro ou cancelamento.',
      400
    );
  }
  if (!newItemsPayload?.length) throw new AppError('O pedido deve ter pelo menos 1 item.', 400);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Devolve estoque dos itens atuais
    for (const item of (order.items ?? [])) {
      if (!item.product_id) continue;
      const qty = parseFloat(item.weight_kg ?? item.quantity);
      await Product.addStock(item.product_id, tenantId, qty, client);
      await Product.createMovement({
        tenantId,
        productId:   item.product_id,
        productName: item.product_name,
        quantity:    qty,
        type:        'in',
        reason:      `Edição do pedido #${order.order_number} (devolução)`,
        orderId:     id,
      }, client);
    }

    // 2. Carrega produtos solicitados
    const productIds = [...new Set(newItemsPayload.map((i) => i.productId))];
    const { rows: products } = await client.query(
      `SELECT id, name, sale_type, sale_price, stock_qty, active
       FROM products WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [productIds, tenantId]
    );
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    // 3. Valida e calcula totais
    //    Se o frontend enviou deliveryOverride, usa os novos valores (evita estado
    //    intermediário errado no socket quando o tipo de entrega muda na edição).
    //    Tipos não-entrega SEMPRE resultam em fee=0 (não confiar no frontend).
    const effectiveDeliveryType = deliveryOverride?.deliveryType ?? order.delivery_type;
    const preservedDeliveryFee = NON_DELIVERY_TYPES.has(effectiveDeliveryType)
      ? 0
      : (deliveryOverride?.deliveryFee != null
          ? Math.max(0, parseFloat(deliveryOverride.deliveryFee) || 0)
          : Math.max(0, parseFloat(order.delivery_fee) || 0));
    let orderTotal = preservedDeliveryFee;
    const resolvedItems = [];
    for (const item of newItemsPayload) {
      const product = productMap[item.productId];
      if (!product) throw new AppError(`Produto ${item.productId} não encontrado.`, 404);
      if (!product.active) throw new AppError(`Produto "${product.name}" está inativo.`, 400);

      let qty, lineTotal;
      if (product.sale_type === 'kg') {
        if (!item.weightKg || item.weightKg <= 0)
          throw new AppError(`Produto "${product.name}" é vendido por kg. Informe weightKg.`, 400);
        qty       = parseFloat(item.weightKg);
        lineTotal = parseFloat(product.sale_price) * qty;
      } else {
        if (!item.quantity || item.quantity <= 0)
          throw new AppError(`Produto "${product.name}": quantity inválido.`, 400);
        qty       = item.quantity;
        lineTotal = parseFloat(product.sale_price) * qty;
      }
      orderTotal += lineTotal;
      resolvedItems.push({ ...item, product, qty, lineTotal });
    }

    // Reaplica ajuste existente (desconto/acréscimo já salvo) para não perder na edição de itens
    const existingAdjValue = parseFloat(order.adjustment_value) || 0;
    if (existingAdjValue > 0) {
      if (order.adjustment_type === 'discount') {
        orderTotal = Math.max(0, orderTotal - existingAdjValue);
      } else {
        orderTotal += existingAdjValue;
      }
    }

    // 4. Desconta estoque dos novos itens
    for (const item of resolvedItems) {
      await Product.deductStock(item.product.id, tenantId, item.qty, client);
      await Product.createMovement({
        tenantId,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    -item.qty,
        type:        'out',
        reason:      `Edição do pedido #${order.order_number}`,
        orderId:     id,
      }, client);
    }

    // 5. Substitui itens no banco
    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);
    for (const [lineNo, item] of resolvedItems.entries()) {
      await Order.createItem({
        orderId:     id,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    item.product.sale_type === 'unit' ? item.quantity : 1,
        weightKg:    item.product.sale_type === 'kg'   ? item.weightKg : null,
        unitPrice:   parseFloat(item.product.sale_price),
        total:       parseFloat(item.lineTotal.toFixed(2)),
        notes:       item.notes ?? null,
        lineNo,
      }, client);
    }

    // 6. Atualiza total do pedido
    await client.query(
      `UPDATE orders SET total = $2, updated_at = NOW() WHERE id = $1`,
      [id, parseFloat(orderTotal.toFixed(2))]
    );

    await client.query('COMMIT');
    const updated = await Order.findById(id, tenantId);

    // Audit log (fora da transaction — falha silenciosa)
    const oldIds    = new Set((order.items ?? []).map((i) => i.product_id).filter(Boolean));
    const newIds    = new Set(newItemsPayload.map((i) => i.productId));
    const oldFeeAudit = Math.max(0, parseFloat(order.delivery_fee) || 0);
    writeAuditLog(tenantId, id, userId, 'items_edited', {
      previous_item_count: (order.items ?? []).length,
      new_item_count:      newItemsPayload.length,
      added:   [...newIds ].filter((x) => !oldIds.has(x)),
      removed: [...oldIds ].filter((x) => !newIds.has(x)),
      new_total: parseFloat(orderTotal.toFixed(2)),
      ...(preservedDeliveryFee !== oldFeeAudit ? {
        delivery_fee_previous: oldFeeAudit,
        delivery_fee_new:      preservedDeliveryFee,
      } : {}),
    });

    return updated;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Atualização de informações do pedido ──────────────────────

/**
 * Atualiza campos de entrega/pagamento e aplica ajuste de valor (desconto/acréscimo).
 * Não altera itens nem estoque — apenas metadados e total.
 */
const updateOrderInfo = async (id, tenantId, {
  deliveryType, neighborhood, customerAddress, deliveryFee,
  notes, adjustmentType, adjustmentValue, adjustmentReason,
  userId = null,
}) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido não encontrado.', 404);

  // Valida motivo quando há ajuste de valor
  const adjVal = adjustmentValue !== undefined ? (parseFloat(adjustmentValue) || 0) : 0;
  if (adjustmentValue !== undefined && adjVal > 0 && !adjustmentReason?.trim()) {
    throw new AppError('Motivo é obrigatório para desconto ou acréscimo.', 400);
  }

  const setClauses = [];
  const params     = [id, tenantId];
  const push = (val) => { params.push(val); return `$${params.length}`; };

  if (deliveryType    !== undefined) setClauses.push(`delivery_type = ${push(deliveryType)}`);
  if (neighborhood    !== undefined) setClauses.push(`neighborhood  = ${push(neighborhood || null)}`);
  if (customerAddress !== undefined) setClauses.push(`customer_address = ${push(customerAddress || null)}`);

  // Regra de negócio: tipos não-entrega → delivery_fee obrigatoriamente 0.
  // Impede que frontend envie fee=10 para pedido de retirada/balcão/mesa.
  const effectiveType = deliveryType !== undefined ? deliveryType : order.delivery_type;
  let effectiveFee;
  if (NON_DELIVERY_TYPES.has(effectiveType)) {
    effectiveFee = 0;
  } else if (deliveryFee !== undefined) {
    effectiveFee = Math.max(0, parseFloat(deliveryFee) || 0);
  } else {
    effectiveFee = Math.max(0, parseFloat(order.delivery_fee) || 0);
  }

  if (deliveryFee !== undefined || deliveryType !== undefined) {
    setClauses.push(`delivery_fee = ${push(effectiveFee)}`);
  }

  // Recalcula total quando taxa, tipo de entrega ou ajuste mudou.
  // adjustmentValue=0 também dispara para zerar desconto existente.
  const totalAfetado =
    deliveryFee !== undefined ||
    deliveryType !== undefined ||
    adjustmentValue !== undefined;

  let newTotal = null;
  if (totalAfetado) {
    const { rows: [sub] } = await db.query(
      `SELECT COALESCE(SUM(total), 0)::float AS subtotal FROM order_items WHERE order_id = $1`,
      [id]
    );
    const subtotal = parseFloat(sub.subtotal) || 0;
    newTotal = subtotal + effectiveFee;
    if (adjustmentValue !== undefined && adjVal > 0) {
      newTotal = adjustmentType === 'discount'
        ? newTotal - adjVal
        : newTotal + adjVal;
    }
    // Total nunca pode ser negativo
    newTotal = Math.max(0, newTotal);
    setClauses.push(`total = ${push(parseFloat(newTotal.toFixed(2)))}`);
  }

  // Salva ajuste em colunas dedicadas (não mais nas notes)
  if (adjustmentValue !== undefined) {
    setClauses.push(`adjustment_type   = ${push(adjVal > 0 ? (adjustmentType || 'discount') : null)}`);
    setClauses.push(`adjustment_value  = ${push(adjVal > 0 ? adjVal : null)}`);
    setClauses.push(`adjustment_reason = ${push(adjVal > 0 ? (adjustmentReason?.trim() || null) : null)}`);
  }

  // Observações do pedido (sem concatenar o ajuste)
  const updatedNotes = notes !== undefined ? (notes || null) : (order.notes ?? null);
  setClauses.push(`notes = ${push(updatedNotes)}`);

  if (setClauses.length === 0) return order;

  setClauses.push(`updated_at = NOW()`);
  await db.query(
    `UPDATE orders SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $2`,
    params
  );

  const result = await Order.findById(id, tenantId);

  // ── Audit logs (fora de transaction — falha silenciosa) ───────

  // Mudança de taxa de entrega
  const oldFee  = Math.max(0, parseFloat(order.delivery_fee) || 0);
  const feeChanged = (deliveryFee !== undefined || deliveryType !== undefined) &&
                     effectiveFee !== oldFee;
  if (feeChanged) {
    writeAuditLog(tenantId, id, userId, 'delivery_fee_changed', {
      previous_delivery_type: order.delivery_type,
      new_delivery_type:      effectiveType,
      previous_fee:           oldFee,
      new_fee:                effectiveFee,
    });
  }

  // Ajuste de valor (desconto/acréscimo)
  if (adjustmentValue !== undefined && adjVal > 0) {
    writeAuditLog(tenantId, id, userId, 'adjustment_applied', {
      type:   adjustmentType,
      value:  adjVal,
      reason: adjustmentReason?.trim() ?? null,
    });
  }

  return result;
};

/**
 * Retorna pedidos agrupados por hora do dia (0-23) para um período.
 * Usado no heatmap de relatórios.
 */
const getHourlyStats = async (tenantId, { startDate, endDate } = {}) => {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT
       EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
       COUNT(*)::int                                                         AS orders,
       COALESCE(SUM(total), 0)::numeric                                      AS revenue,
       ROUND(AVG(total)::numeric, 2)                                         AS avg_ticket
     FROM orders
     WHERE tenant_id = $1
       AND status NOT IN ('cancelled')
       AND created_at >= ($2::date)
       AND created_at <  ($3::date + INTERVAL '1 day')
     GROUP BY hour
     ORDER BY hour ASC`,
    [tenantId, start, end]
  );

  // Fill all 24 hours (0-23) even if no data
  const map = Object.fromEntries(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, h) => ({
    hour:       h,
    orders:     map[h]?.orders  ?? 0,
    revenue:    parseFloat(map[h]?.revenue  ?? 0),
    avg_ticket: parseFloat(map[h]?.avg_ticket ?? 0),
  }));
};

module.exports = { listOrders, getOrder, createOrder, createExternalOrder, updateStatus, cancelOrder, markAsPaid, editOrderItems, updateOrderInfo, getHourlyStats };
