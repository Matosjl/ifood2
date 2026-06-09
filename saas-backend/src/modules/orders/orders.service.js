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
const createOrder = async (tenantId, {
  customerName, customerPhone, customerAddress,
  channel = 'manual', notes, items, deliveryType = 'pickup', paymentMethod = 'cash',
  deliveryFee = 0, neighborhood = null, initialStatus = 'pending', idempotencyKey,
  loyaltyCustomerId = null, cashbackUsed = 0, tableNumber = null,
  deliveryLat = null, deliveryLng = null,
  cashChangeFor = null,
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

    // D2: valida deliveryFee contra delivery_zones do tenant (canal online/delivery)
    // Se o bairro tem zona configurada e a taxa enviada diverge mais de R$0,50 → corrige
    if (deliveryType === 'delivery' && neighborhood) {
      const { rows: tenantZones } = await client.query(
        `SELECT delivery_zones FROM tenants WHERE id = $1`, [tenantId]
      );
      const zones = tenantZones[0]?.delivery_zones;
      if (Array.isArray(zones) && zones.length > 0) {
        const zone = zones.find(
          (z) => z.name?.toLowerCase() === neighborhood?.toLowerCase()
        );
        if (zone) {
          const zoneFee = parseFloat(zone.fee) || 0;
          const sentFee = parseFloat(deliveryFee) || 0;
          if (Math.abs(sentFee - zoneFee) > 0.50) {
            logger.warn('D2: delivery_fee diverge da zona — corrigido pelo backend', {
              tenantId, neighborhood, sent: sentFee, zone: zoneFee,
            });
            deliveryFee = zoneFee;
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

      let qty, lineTotal;
      if (product.sale_type === 'kg') {
        if (!item.weightKg || item.weightKg <= 0)
          throw new AppError(`Produto "${product.name}" e vendido por kg. Informe weightKg.`, 400);
        qty       = item.weightKg;
        lineTotal = parseFloat(product.sale_price) * item.weightKg;
      } else {
        if (!item.quantity || item.quantity <= 0)
          throw new AppError(`Produto "${product.name}": quantity invalido.`, 400);
        qty       = item.quantity;
        lineTotal = parseFloat(product.sale_price) * item.quantity;
      }

      // Soma preço dos complementos escolhidos
      const addonsTotal = (item.addons ?? []).reduce(
        (sum, a) => sum + (parseFloat(a.unit_price) || 0) * (a.qty || 1) * qty,
        0
      );
      lineTotal += addonsTotal;

      orderTotal += lineTotal;
      resolvedItems.push({ ...item, product, qty, lineTotal });
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

    const orderNumber = await Order.nextOrderNumber(tenantId, client);

    const order = await Order.createOrder({
      tenantId, orderNumber,
      customerName, customerPhone, customerAddress,
      channel, total: parseFloat(orderTotal.toFixed(2)), notes,
      deliveryType, paymentMethod, deliveryFee: parseFloat(deliveryFee) || 0,
      neighborhood: neighborhood || null,
      initialStatus, idempotencyKey,
      loyaltyCustomerId: loyaltyCustomerId || null,
      cashbackUsed: parseFloat(cashbackUsed) || 0,
      tableNumber: tableNumber || null,
      deliveryLat: deliveryLat || null,
      deliveryLng: deliveryLng || null,
      cashChangeFor: cashChangeFor ? parseFloat(cashChangeFor) : null,
    }, client);

    for (const item of resolvedItems) {
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
        orderId:     order.id,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    item.product.sale_type === 'unit' ? item.quantity : 1,
        weightKg:    item.product.sale_type === 'kg'   ? item.weightKg : null,
        unitPrice:   parseFloat(item.product.sale_price),
        total:       parseFloat(item.lineTotal.toFixed(2)),
        notes:       item.notes,
        unitCost,
        totalCost:   parseFloat((unitCost * soldQty).toFixed(2)),
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

    for (const item of validItems) {
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

const updateStatus = async (id, tenantId, status) => {
  const updatedOrder = await Order.updateStatus(id, tenantId, status);

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
 * @param {string|null} reason - Motivo do cancelamento (armazenado em orders.cancel_reason)
 */
const cancelOrder = async (id, tenantId, reason = null) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido nao encontrado.', 404);

  const updated = await Order.updateStatus(id, tenantId, 'cancelled', reason);

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

  // Remove do cache Redis (status = cancelled → hdel automático via upsertOrder)
  orderCache.upsertOrder(tenantId, updated).catch(() => {});

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

/**
 * Substitui os itens de um pedido ainda editável (pending/confirmed/preparing).
 * Devolve o estoque dos itens antigos e desconta o dos novos.
 * Atualiza order.total.
 */
const editOrderItems = async (id, tenantId, newItemsPayload) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido não encontrado.', 404);

  const editableStatuses = ['pending', 'confirmed', 'preparing'];
  if (!editableStatuses.includes(order.status)) {
    throw new AppError(
      `Itens só podem ser editados em pedidos Pendentes ou Em Preparo (status atual: ${order.status}).`,
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
    //    Total deve incluir a taxa de entrega; editOrderItems nao altera
    //    entrega, entao preserva a delivery_fee atual (0 se nao for delivery).
    const preservedDeliveryFee = order.delivery_type === 'delivery'
      ? (parseFloat(order.delivery_fee) || 0)
      : 0;
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
    for (const item of resolvedItems) {
      await Order.createItem({
        orderId:     id,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    item.product.sale_type === 'unit' ? item.quantity : 1,
        weightKg:    item.product.sale_type === 'kg'   ? item.weightKg : null,
        unitPrice:   parseFloat(item.product.sale_price),
        total:       parseFloat(item.lineTotal.toFixed(2)),
        notes:       item.notes ?? null,
      }, client);
    }

    // 6. Atualiza total do pedido
    await client.query(
      `UPDATE orders SET total = $2, updated_at = NOW() WHERE id = $1`,
      [id, parseFloat(orderTotal.toFixed(2))]
    );

    await client.query('COMMIT');
    return Order.findById(id, tenantId);

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
}) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido não encontrado.', 404);

  const setClauses = [];
  const params     = [id, tenantId];

  const push = (val) => { params.push(val); return `$${params.length}`; };

  if (deliveryType    !== undefined) setClauses.push(`delivery_type = ${push(deliveryType)}`);
  if (neighborhood    !== undefined) setClauses.push(`neighborhood  = ${push(neighborhood || null)}`);
  if (customerAddress !== undefined) setClauses.push(`customer_address = ${push(customerAddress || null)}`);
  // -- Recalculo de total: total = soma_itens + delivery_fee - desc + acresc --
  // Regra: delivery_type != 'delivery' => delivery_fee = 0.
  const effectiveType = deliveryType !== undefined ? deliveryType : order.delivery_type;
  let effectiveFee;
  if (effectiveType !== 'delivery')   effectiveFee = 0;
  else if (deliveryFee !== undefined) effectiveFee = parseFloat(deliveryFee) || 0;
  else                                effectiveFee = parseFloat(order.delivery_fee) || 0;

  // Persiste a taxa quando entrega/taxa foram tocadas (zera em retirada/mesa).
  if (deliveryFee !== undefined || deliveryType !== undefined) {
    setClauses.push(`delivery_fee = ${push(effectiveFee)}`);
  }

  // Recalcula o total apenas quando algo que o afeta mudou (taxa, tipo de
  // entrega ou ajuste). Edicao so de observacoes nao mexe no total.
  const totalAfetado =
    deliveryFee !== undefined ||
    deliveryType !== undefined ||
    (adjustmentValue && parseFloat(adjustmentValue) > 0);

  if (totalAfetado) {
    const { rows: [sub] } = await db.query(
      `SELECT COALESCE(SUM(total), 0)::float AS subtotal FROM order_items WHERE order_id = $1`,
      [id]
    );
    const subtotal = parseFloat(sub.subtotal) || 0;

    let newTotal = subtotal + effectiveFee;
    if (adjustmentValue && parseFloat(adjustmentValue) > 0) {
      const delta = parseFloat(adjustmentValue);
      newTotal = adjustmentType === 'discount'
        ? Math.max(0, newTotal - delta)
        : newTotal + delta;
    }
    setClauses.push(`total = ${push(parseFloat(newTotal.toFixed(2)))}`);
  }

  // Mescla observações
  const adjNote = adjustmentValue && parseFloat(adjustmentValue) > 0
    ? `[${adjustmentType === 'discount' ? 'Desconto' : 'Acréscimo'}: ${
        adjustmentType === 'discount' ? '-' : '+'
      }R$${parseFloat(adjustmentValue).toFixed(2)}${adjustmentReason ? ' — ' + adjustmentReason : ''}]`
    : '';

  const existingNotes = order.notes ?? '';
  const updatedNotes  = notes !== undefined ? notes : existingNotes;
  const finalNotes    = [updatedNotes, adjNote].filter(Boolean).join(' | ') || null;
  setClauses.push(`notes = ${push(finalNotes)}`);

  if (setClauses.length === 0) return order;

  setClauses.push(`updated_at = NOW()`);
  await db.query(
    `UPDATE orders SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $2`,
    params
  );
  return Order.findById(id, tenantId);
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
