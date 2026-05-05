const { v4: uuidv4 } = require('uuid');
const db             = require('../../config/database');
const { enqueueAndWait } = require('../../queues/order.queue');
const asyncHandler   = require('../../utils/asyncHandler');
const AppError       = require('../../utils/AppError');

// GET /api/public/:slug  — menu público
const getMenu = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id, name, slug FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  const { rows: products } = await db.query(
    `SELECT p.id, p.name, p.description, p.sale_type, p.sale_price,
            p.stock_qty, p.image_url, c.name AS category_name
     FROM   products p
     LEFT   JOIN categories c ON c.id = p.category_id
     WHERE  p.tenant_id = $1 AND p.active = true AND p.stock_qty > 0
     ORDER  BY c.name NULLS LAST, p.name`,
    [tenant.id]
  );

  // Agrupar por categoria
  const grouped = {};
  for (const p of products) {
    const cat = p.category_name ?? 'Outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  }
  const categories = Object.entries(grouped).map(([name, items]) => ({ name, items }));

  res.json({ success: true, data: { tenant, categories } });
});

// POST /api/public/:slug/orders  — criar pedido (cliente)
const createOrder = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  const { customerName, customerPhone, customerAddress, deliveryType, notes, items } = req.body;
  if (!items?.length) throw new AppError('Adicione pelo menos 1 item.', 400);
  if (!customerName)  throw new AppError('Informe seu nome.', 400);
  if (deliveryType === 'delivery' && !customerAddress)
    throw new AppError('Informe o endereço de entrega.', 400);

  const idempotencyKey = uuidv4();
  const order = await enqueueAndWait(
    'create',
    {
      tenantId: tenant.id,
      payload: {
        customerName, customerPhone, customerAddress,
        deliveryType: deliveryType || 'pickup',
        channel: 'online',
        notes,
        items,
      },
      idempotencyKey,
      isOnline: true,
    },
    { idempotencyKey }
  );

  res.status(201).json({ success: true, data: order });
});

// GET /api/public/order/:id  — rastrear pedido
const trackOrder = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
            o.customer_name, o.delivery_type, o.customer_address,
            json_agg(
              json_build_object(
                'product_name', oi.product_name,
                'quantity',     oi.quantity,
                'weight_kg',    oi.weight_kg,
                'total',        oi.total
              ) ORDER BY oi.id
            ) AS items
     FROM   orders o
     JOIN   order_items oi ON oi.order_id = o.id
     WHERE  o.id = $1
     GROUP  BY o.id`,
    [req.params.id]
  );
  if (!rows[0]) throw new AppError('Pedido não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

module.exports = { getMenu, createOrder, trackOrder };
