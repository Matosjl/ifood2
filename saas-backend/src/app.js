const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const env        = require('./config/env');
const errorHandler = require('./middleware/errorHandler.middleware');

// ── Sentry (opcional — só ativa se SENTRY_DSN estiver definido) ──
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}

// Rotas
const publicRoutes   = require('./modules/public/public.routes');
const authRoutes     = require('./modules/auth/auth.routes');
const productRoutes  = require('./modules/products/products.routes');
const orderRoutes    = require('./modules/orders/orders.routes');
const tenantRoutes      = require('./modules/tenant/tenant.routes');
const financeiroRoutes  = require('./modules/financeiro/financeiro.routes');
const caixaRoutes       = require('./modules/caixa/caixa.routes');
const usersRoutes       = require('./modules/users/users.routes');
const adminRoutes    = require('./modules/admin/admin.routes');
const bancoRoutes    = require('./modules/banco/banco.routes');
const fiadoRoutes    = require('./modules/fiado/fiado.routes');
const billingRoutes  = require('./modules/billing/billing.routes');
const driverRoutes   = require('./modules/driver/driver.routes');
const internalRoutes = require('./modules/internal/internal.routes');
const aiRoutes       = require('./modules/ai/ai.routes');
const addonsRoutes   = require('./modules/addons/addons.routes');
const insumosRoutes    = require('./modules/insumos/insumos.routes');
const locationsRoutes  = require('./modules/locations/locations.routes');
const couponsRoutes    = require('./modules/coupons/coupons.routes');
const tablesRoutes     = require('./modules/tables/tables.routes');
const campaignsRoutes  = require('./modules/campaigns/campaigns.routes');
const productCtrl    = require('./modules/products/products.controller');
const { authenticate } = require('./middleware/auth.middleware');
const { PLANS }      = require('./config/plans');

const app = express();

// ── Trust proxy (nginx em frente ao Express) ──────────────────
app.set('trust proxy', 1);

// ── Segurança ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // Permite requests sem origin (Postman, curl) em dev
    if (!origin || env.isDev()) return cb(null, true);
    if (env.CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origem não permitida: ${origin}`));
  },
  credentials: true,
}));

// Rate limit global (fallback — rotas críticas têm limite próprio)
app.use(rateLimit({
  windowMs: 60 * 1000,   // 1 minuto
  max: 300,              // 300 req/minuto por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas requisições. Tente novamente em breve.' },
}));

// ── Parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files (uploads) ────────────────────────────────────
const path = require('path');
app.use('/uploads', require('express').static(
  process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')
));

// ── Logging ───────────────────────────────────────────────────
// Morgan em dev para coloração rápida no terminal; requestLogger em todos os ambientes
// para logs estruturados (JSON em prod, one-liner em dev)
if (env.isDev()) app.use(morgan('dev'));
app.use(require('./middleware/requestLogger.middleware'));

// ── Health check (sem auth) ───────────────────────────────────
// Verifica DB, Redis e VPS2. Retorna 200 se tudo ok, 503 se algo falhou.
app.get('/health', async (req, res) => {
  try {
    const { runChecks } = require('./services/healthMonitor');
    const checks   = await runChecks();
    const allOk    = Object.values(checks).every((c) => c.ok);
    const status   = allOk ? 'ok' : 'degraded';
    const httpCode = allOk ? 200 : 503;

    res.status(httpCode).json({
      success:   allOk,
      status,
      timestamp: new Date().toISOString(),
      checks: {
        db:    checks.db.ok    ? 'ok' : `down: ${checks.db.error    ?? '?'}`,
        redis: checks.redis.ok ? 'ok' : `down: ${checks.redis.error ?? '?'}`,
        vps2:  checks.vps2.ok  ? 'ok' : `down: ${checks.vps2.error  ?? '?'}`,
      },
    });
  } catch (err) {
    res.status(503).json({ success: false, status: 'error', error: err.message });
  }
});

// ── Rotas da API ──────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/tenant',     tenantRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/financeiro/receipts', require('./modules/financeiro/receipts.routes'));
app.use('/api/caixa',     caixaRoutes);
app.use('/api/users',      usersRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/banco',      bancoRoutes);
app.use('/api/fiado',      fiadoRoutes);
app.use('/api/billing',    billingRoutes);
app.use('/api/driver',     driverRoutes);
app.use('/api/internal',   internalRoutes); // Chamado pelo AI Engine (VPS2) — auth via X-Internal-Key
app.use('/api/ai',         aiRoutes);       // Agentes IA (VPS2) — auth via JWT
app.use('/api/addons',     addonsRoutes);   // Complementos / Adicionais
app.use('/api/insumos',    insumosRoutes);  // Controle de insumos / ingredientes
app.use('/api/coupons',    couponsRoutes);
app.use('/api/tables',     tablesRoutes);
app.use('/api/campaigns',  campaignsRoutes);
app.use('/api/nfce',           require('./modules/nfce/nfce.routes'));
app.use('/api/integrations',   require('./modules/integrations/integrations.routes'));
app.use('/api/pix',            require('./modules/pix/pix.routes'));
app.use('/api/promotions',     require('./modules/promotions/promotions.routes'));
app.use('/api/ratings',        require('./modules/ratings/ratings.routes'));
app.use('/api/reservations',   require('./modules/reservations/reservations.routes'));
app.use('/api/locations',      locationsRoutes);

// GET /api/plans — endpoint público com os planos disponíveis
app.get('/api/plans', (req, res) => {
  const plans = Object.values(PLANS).map(p => ({
    id:       p.id,
    name:     p.name,
    price:    p.price,
    limits:   p.limits,
    features: p.features,
  }));
  res.json({ success: true, data: plans });
});

// Categorias e movimentações globais de estoque (requerem auth)
app.use('/api/categories',        authenticate, require('express').Router()
  .get('/',       productCtrl.listCats)
  .post('/',      productCtrl.createCat)
  .patch('/:id',  productCtrl.updateCat)
  .delete('/:id', productCtrl.deleteCat)
);
app.get('/api/stock/movements', authenticate, productCtrl.allMovements);

app.use('/api/public', publicRoutes);

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Rota não encontrada: ${req.method} ${req.path}` })
);

// ── Sentry error handler (antes do nosso errorHandler) ───────
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ── Error Handler (deve ser o último) ────────────────────────
app.use(errorHandler);

module.exports = app;
