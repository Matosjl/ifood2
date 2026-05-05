const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const env        = require('./config/env');
const errorHandler = require('./middleware/errorHandler.middleware');

// Rotas
const authRoutes     = require('./modules/auth/auth.routes');
const productRoutes  = require('./modules/products/products.routes');
const orderRoutes    = require('./modules/orders/orders.routes');
const tenantRoutes      = require('./modules/tenant/tenant.routes');
const financeiroRoutes  = require('./modules/financeiro/financeiro.routes');
const productCtrl    = require('./modules/products/products.controller');
const { authenticate } = require('./middleware/auth.middleware');
const { PLANS }      = require('./config/plans');

const app = express();

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

// ── Logging ───────────────────────────────────────────────────
app.use(morgan(env.isDev() ? 'dev' : 'combined'));

// ── Health check (sem auth) ───────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() })
);

// ── Rotas da API ──────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/tenant',     tenantRoutes);
app.use('/api/financeiro', financeiroRoutes);

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
  .get('/',     productCtrl.listCats)
  .post('/',    productCtrl.createCat)
  .delete('/:id', productCtrl.deleteCat)
);
app.get('/api/stock/movements', authenticate, productCtrl.allMovements);

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Rota não encontrada: ${req.method} ${req.path}` })
);

// ── Error Handler (deve ser o último) ────────────────────────
app.use(errorHandler);

module.exports = app;
