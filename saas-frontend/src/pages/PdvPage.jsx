/**
 * PdvPage — PDV completo ZapFome
 * Layout: Header | [Produtos | Pedido] | Footer
 * Integrado com: products, categories, caixa, orders, fiado, addons
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listProducts, listCategories, getByBarcode } from '../api/products';
import { createOrder, searchCustomers, createCustomer } from '../api/orders';
import { getCurrentCaixa, openCaixa } from '../api/caixa';
import { getProductAddonGroups } from '../api/addons';
import { listFiadoClientes } from '../api/fiado';
import { fmt, PAY_OPTIONS } from '../constants/orders';
import { cartTotal, itemBasePrice } from '../utils/cart';
import { printPdvCart } from '../utils/print';

// ── Constantes ───────────────────────────────────────────────
const HELD_KEY = 'zapfome_pdv_held';

const DELIVERY_TABS = [
  { id: 'balcao',   label: 'Balcão',   icon: '🏪', deliveryType: 'balcao',   channel: 'manual' },
  { id: 'retirada', label: 'Retirada', icon: '🏃', deliveryType: 'pickup',   channel: 'manual' },
  { id: 'delivery', label: 'Delivery', icon: '🛵', deliveryType: 'delivery', channel: 'manual' },
  { id: 'mesa',     label: 'Mesa',     icon: '🪑', deliveryType: 'pickup',   channel: 'mesa'   },
];

const PDV_PAY = PAY_OPTIONS.filter((p) =>
  ['cash', 'pix', 'credit', 'debit', 'fiado', 'voucher', 'pending'].includes(p.value)
);

// ── Helpers ──────────────────────────────────────────────────

function buildItems(cart) {
  return Object.values(cart).map(({ product, qty, weightKg, addons, notes, variation, choices }) => ({
    productId:          product.id,
    quantity:           product.sale_type === 'kg' ? null : qty,
    weightKg:           product.sale_type === 'kg' ? parseFloat(weightKg || 0) : null,
    notes:              notes || null,
    variationOptionIds: (variation ?? []).map((s) => s.optionId).filter(Boolean),
    addons: (addons ?? []).map((a) => ({
      addon_item_id: a.addon_item_id,
      qty:           a.qty ?? 1,
      unit_price:    a.unit_price,
    })),
    choices: choices ?? null,
  }));
}

function loadHeld() {
  try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]'); } catch { return []; }
}
function saveHeld(list) {
  localStorage.setItem(HELD_KEY, JSON.stringify(list));
}

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const dd = t.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
  const hh = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="text-right hidden md:block">
      <p className="text-base font-black text-white tabular-nums">{hh}</p>
      <p className="text-[10px] text-gray-500 capitalize">{dd}</p>
    </div>
  );
}

// ── Modal: Abrir Caixa ───────────────────────────────────────
function OpenCaixaModal({ onOpen, onClose }) {
  const [opening, setOpening] = useState(false);
  const [balance, setBalance] = useState('');
  const [err, setErr] = useState('');

  const handle = async () => {
    setOpening(true); setErr('');
    try {
      await onOpen({ openingBalance: parseFloat(balance || 0) });
    } catch (e) {
      setErr(e?.response?.data?.message || 'Erro ao abrir caixa');
    } finally { setOpening(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-white/10">
          <p className="text-lg font-black text-white">Abrir Caixa</p>
          <p className="text-xs text-gray-500 mt-1">Informe o saldo inicial para começar as vendas</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Saldo inicial (R$)</label>
            <input
              type="number" min="0" step="0.01" placeholder="0,00"
              value={balance} onChange={(e) => setBalance(e.target.value)}
              className="input w-full text-lg font-bold text-right"
              autoFocus
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 text-sm font-semibold hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button onClick={handle} disabled={opening}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-black transition-colors disabled:opacity-50">
            {opening ? 'Abrindo...' : 'Abrir Caixa'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal: Variações ─────────────────────────────────────────
function VariationPicker({ product, selections, onSelect, onConfirm, onClose }) {
  const groups = (product.variations ?? []).filter((g) => g.options?.some((o) => o.available));
  const canConfirm = groups.filter((g) => g.required).every((g) => selections[g.id]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-black text-white">{product.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Selecione as opções</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-bold text-gray-200">{g.name}</p>
                {g.required
                  ? <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-semibold">Obrigatório</span>
                  : <span className="text-[10px] bg-gray-700/60 text-gray-500 px-1.5 py-0.5 rounded-full">Opcional</span>
                }
              </div>
              <div className="space-y-1.5">
                {g.options.filter((o) => o.available).map((opt) => {
                  const sel = selections[g.id]?.optionId === opt.id;
                  return (
                    <button key={opt.id} type="button"
                      onClick={() => onSelect(g.id, { optionId: opt.id, optionName: opt.name, price: parseFloat(opt.price) })}
                      className={[
                        'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all text-left',
                        sel ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 hover:border-white/20 bg-gray-800/40',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sel ? 'border-orange-500 bg-orange-500' : 'border-gray-600'}`}>
                          {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className="text-sm font-semibold text-gray-200">{opt.name}</span>
                      </div>
                      <span className={`text-sm font-bold ${sel ? 'text-orange-400' : 'text-gray-400'}`}>
                        {fmt(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          <button onClick={onConfirm} disabled={!canConfirm}
            className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {canConfirm ? 'Adicionar ao Pedido' : 'Selecione as opções obrigatórias'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal: Complementos ──────────────────────────────────────
function AddonPicker({ product, groups, onConfirm, onClose }) {
  const [sel, setSel] = useState(() => {
    const m = {};
    for (const g of groups) m[g.id] = {};
    return m;
  });

  const toggle = (gid, item) => setSel((prev) => {
    const grp = { ...(prev[gid] ?? {}) };
    if (grp[item.id]) delete grp[item.id]; else grp[item.id] = 1;
    return { ...prev, [gid]: grp };
  });

  const handleConfirm = () => {
    const addons = [];
    for (const g of groups)
      for (const item of g.items)
        if (sel[g.id]?.[item.id])
          addons.push({ addon_item_id: item.id, addon_name: item.name, qty: 1, unit_price: parseFloat(item.price), total: parseFloat(item.price) });
    onConfirm(addons);
  };

  const extra = groups.reduce((s, g) => {
    for (const item of g.items) s += (sel[g.id]?.[item.id] ?? 0) * parseFloat(item.price);
    return s;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between">
          <div>
            <h3 className="text-base font-black text-white">{product.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Escolha os complementos</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 ml-2">✕</button>
        </div>
        <div className="overflow-y-auto max-h-80 p-4 space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-2">{g.name}</p>
              <div className="space-y-1">
                {g.items.filter((i) => i.active !== false).map((item) => {
                  const active = !!(sel[g.id]?.[item.id]);
                  return (
                    <button key={item.id} type="button" onClick={() => toggle(g.id, item)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-sm ${
                        active ? 'bg-orange-500/15 border-orange-500/40 text-white' : 'bg-gray-800/50 border-white/[0.06] text-gray-300 hover:bg-gray-700/60'
                      }`}
                    >
                      <span className="font-medium">{item.name}</span>
                      <div className="flex items-center gap-2">
                        {parseFloat(item.price) > 0 && <span className="text-xs text-gray-400">+{fmt(item.price)}</span>}
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${active ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-600'}`}>
                          {active ? '✓' : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">Base: <span className="text-gray-300">{fmt(product.sale_price)}</span></p>
            {extra > 0 && <p className="text-xs text-orange-400 font-semibold">+{fmt(extra)} extras</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-xl bg-gray-800 text-gray-400 text-sm font-semibold hover:bg-gray-700">Sem extras</button>
            <button onClick={handleConfirm} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400">Confirmar</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Drawer: Pedidos em espera ────────────────────────────────
function HeldDrawer({ held, onRestore, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-80 bg-gray-900 border-l border-white/10 flex flex-col h-full"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-black text-white">Pedidos em Espera</p>
            <p className="text-xs text-gray-500">{held.length} pedido{held.length !== 1 ? 's' : ''} segurado{held.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {held.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-gray-600 gap-2">
              <span className="text-3xl">📋</span>
              <p className="text-xs italic">Nenhum pedido em espera</p>
            </div>
          )}
          {held.map((h, i) => (
            <div key={h.id} className="bg-gray-800/60 rounded-xl p-3 border border-white/[0.06]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{h.customerName || 'Consumidor Final'}</p>
                  <p className="text-xs text-gray-500">{new Date(h.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {Object.keys(h.cart).length} item{Object.keys(h.cart).length !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-black text-orange-400 shrink-0">{fmt(h.total)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onRestore(i)}
                  className="flex-1 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 text-xs font-bold hover:bg-orange-500/30 transition-colors">
                  Recuperar
                </button>
                <button onClick={() => onDelete(i)}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ── Produto card ─────────────────────────────────────────────
function ProductCard({ product, inCart, onAdd }) {
  const esgotado = product.stock_qty !== undefined && product.stock_qty !== null && product.stock_qty <= 0;
  const handleClick = () => {
    if (esgotado) return;
    onAdd(product);
  };
  return (
    <div
      onClick={handleClick}
      className={`relative bg-gray-800/60 border rounded-xl overflow-hidden flex flex-col transition-all select-none ${esgotado ? 'opacity-50 border-white/[0.04] cursor-not-allowed' : 'border-white/[0.07] hover:border-orange-500/40 hover:bg-gray-800/90 cursor-pointer active:scale-[0.97]'} ${inCart ? 'ring-1 ring-orange-500/50' : ''}`}
    >
      {/* Imagem compacta */}
      <div className="h-16 bg-gray-900/80 flex items-center justify-center overflow-hidden shrink-0 relative">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl select-none">🍽️</span>
        )}
        {inCart > 0 && (
          <div className="absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-orange-500 flex items-center justify-center">
            <span className="text-[10px] font-black text-white">{inCart}</span>
          </div>
        )}
        {esgotado && (
          <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center">
            <span className="text-[10px] text-red-400 font-bold bg-gray-900/80 px-2 py-0.5 rounded-full">Esgotado</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-2 flex flex-col flex-1 gap-1">
        <p className="text-xs font-bold text-gray-200 leading-tight line-clamp-2">{product.name}</p>
        <div className="flex items-center justify-between gap-1 mt-auto">
          <div>
            <p className="text-sm font-black text-white">{fmt(product.sale_price)}</p>
            {product.sale_type === 'kg' && <p className="text-[10px] text-gray-500">/ kg</p>}
          </div>
          {/* stopPropagation evita duplo add quando clica no botão (card já tratou) */}
          <button
            disabled={esgotado}
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
            className="w-6 h-6 rounded-lg bg-orange-500 hover:bg-orange-400 text-white flex items-center justify-center text-xs font-black transition-colors disabled:opacity-30 shrink-0"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast simples ────────────────────────────────────────────
function Toast({ msg, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const color = type === 'error' ? 'bg-red-600' : type === 'warn' ? 'bg-yellow-600' : 'bg-green-600';
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold ${color} flex items-center gap-2`}
    >
      {type === 'error' ? '⚠️' : type === 'warn' ? '⚡' : '✅'} {msg}
    </motion.div>
  );
}

// ── Split payment row ─────────────────────────────────────────
function SplitPaymentRow({ split, totalCount, onUpdate, onRemove, fiadoClientes }) {
  const splitAmt  = parseFloat(split.amount) || 0;
  const recvAmt   = parseFloat(split.receivedAmount) || 0;
  const troco     = split.method === 'cash' && recvAmt > 0 ? Math.max(0, recvAmt - splitAmt) : 0;
  const methodCls = {
    cash:    'border-green-400 bg-green-500/10 text-green-300',
    pix:     'border-blue-400 bg-blue-500/10 text-blue-300',
    credit:  'border-violet-400 bg-violet-500/10 text-violet-300',
    debit:   'border-indigo-400 bg-indigo-500/10 text-indigo-300',
    fiado:   'border-purple-400 bg-purple-500/10 text-purple-300',
    voucher: 'border-yellow-400 bg-yellow-500/10 text-yellow-300',
    other:   'border-gray-400 bg-gray-500/10 text-gray-300',
  }[split.method] || 'border-white/20 text-gray-300';

  return (
    <div className={`rounded-xl border p-2 space-y-1.5 ${methodCls}`}>
      <div className="flex items-center gap-1.5">
        <select
          value={split.method}
          onChange={(e) => onUpdate({ method: e.target.value, receivedAmount: '', fiadoClienteId: '' })}
          className="flex-1 text-[11px] bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-gray-200 focus:outline-none"
        >
          {PDV_PAY.filter((p) => p.value !== 'pending').map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          type="number" min="0" step="0.01" placeholder="Valor"
          value={split.amount}
          onChange={(e) => onUpdate({ amount: e.target.value })}
          className="w-20 text-[11px] bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-right text-white font-bold focus:outline-none focus:border-current"
        />
        {totalCount > 1 && (
          <button onClick={onRemove} className="shrink-0 text-gray-600 hover:text-red-400 transition-colors text-xs">✕</button>
        )}
      </div>
      {split.method === 'cash' && (
        <div className="flex items-center gap-2">
          <input
            type="number" min="0" step="0.01" placeholder="Recebido (opcional)"
            value={split.receivedAmount}
            onChange={(e) => onUpdate({ receivedAmount: e.target.value })}
            className="flex-1 text-[11px] bg-gray-800/70 border border-white/10 rounded-lg px-2 py-1 text-gray-300 focus:outline-none"
          />
          {troco > 0 && (
            <span className="text-[11px] font-black text-green-400 shrink-0">Troco {fmt(troco)}</span>
          )}
        </div>
      )}
      {split.method === 'fiado' && (
        <select
          value={split.fiadoClienteId}
          onChange={(e) => onUpdate({ fiadoClienteId: e.target.value })}
          className="w-full text-[11px] bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-gray-200 focus:outline-none"
        >
          <option value="">— selecionar cliente fiado —</option>
          {fiadoClientes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── Main PDV ─────────────────────────────────────────────────
export default function PdvPage({ onNavigate }) {
  const user   = useMemo(() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }, []);
  const tenant = useMemo(() => { try { return JSON.parse(localStorage.getItem('tenant') || '{}'); } catch { return {}; } }, []);

  // ── Caixa ─────────────────────────────────────────────────
  const [caixa,        setCaixa]        = useState(null);
  const [caixaLoading, setCaixaLoading] = useState(true);
  const [showOpenCaixa, setShowOpenCaixa] = useState(false);

  // ── Catálogo ──────────────────────────────────────────────
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [prodLoad,   setProdLoad]   = useState(true);
  const [selCat,     setSelCat]     = useState('todos');
  const [search,     setSearch]     = useState('');
  const searchRef = useRef(null);

  // ── Pedido / Carrinho ─────────────────────────────────────
  const [cart,          setCart]          = useState({});
  const [deliveryMode,  setDeliveryMode]  = useState('balcao');
  const [tableNumber,   setTableNumber]   = useState('');
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId,    setCustomerId]    = useState(null);
  const [custSearch,    setCustSearch]    = useState(false);
  const [custSuggestions, setCustSuggestions] = useState([]);
  const custTimer   = useRef(null);
  const scanBuffer  = useRef('');
  const scanTimer   = useRef(null);

  // Delivery
  const [delivStreet,   setDelivStreet]   = useState('');
  const [delivNumber,   setDelivNumber]   = useState('');
  const [delivNeigh,    setDelivNeigh]    = useState('');
  const [delivFee,      setDelivFee]      = useState('');

  // Pagamento
  const [payMethod,    setPayMethod]    = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [discountType, setDiscountType] = useState('fixed'); // fixed | percent
  const [discountVal,  setDiscountVal]  = useState('');
  const [orderNotes,   setOrderNotes]   = useState('');

  // Fiado
  const [fiadoClientes,   setFiadoClientes]   = useState([]);
  const [fiadoClienteId,  setFiadoClienteId]  = useState('');
  const [fiadoSearch,     setFiadoSearch]     = useState('');

  // Pagamento dividido
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState([{ id: 1, method: 'cash', amount: '', receivedAmount: '', fiadoClienteId: '' }]);

  // Variation / Addon pickers
  const [varPicker,   setVarPicker]   = useState(null); // { product, selections }
  const [addonPicker, setAddonPicker] = useState(null); // { product, groups }
  const [pendingAdd,  setPendingAdd]  = useState(null); // product awaiting addon pick

  // Held orders
  const [held,       setHeld]       = useState(loadHeld);
  const [showHeld,   setShowHeld]   = useState(false);

  // UI
  const [submitting,    setSubmitting]    = useState(false);
  const [toast,         setToast]         = useState(null);
  const [showCustForm,  setShowCustForm]  = useState(false);

  // ── Load caixa ────────────────────────────────────────────
  const refreshCaixa = useCallback(async () => {
    setCaixaLoading(true);
    try {
      const { data } = await getCurrentCaixa();
      setCaixa(data?.data ?? null);
    } catch { setCaixa(null); }
    finally { setCaixaLoading(false); }
  }, []);

  // ── Load products + categories ────────────────────────────
  const loadCatalog = useCallback(async () => {
    setProdLoad(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        listProducts({ limit: 200, available: true }),
        listCategories(),
      ]);
      setProducts(prodRes.data?.data ?? prodRes.data?.products ?? []);
      setCategories(catRes.data?.data ?? catRes.data ?? []);
    } catch { /* keep empty */ }
    finally { setProdLoad(false); }
  }, []);

  useEffect(() => {
    refreshCaixa();
    loadCatalog();
  }, [refreshCaixa, loadCatalog]);

  // Expande form de cliente automaticamente quando delivery (telefone obrigatório)
  useEffect(() => {
    if (deliveryMode === 'delivery') setShowCustForm(true);
  }, [deliveryMode]);

  // Load fiado clientes quando necessário (single ou split)
  useEffect(() => {
    const needFiado = splitMode
      ? splits.some((s) => s.method === 'fiado')
      : payMethod === 'fiado';
    if (!needFiado || fiadoClientes.length > 0) return;
    listFiadoClientes({ limit: 100 })
      .then(({ data }) => setFiadoClientes(data?.data ?? data ?? []))
      .catch(() => {});
  }, [payMethod, splitMode, splits, fiadoClientes.length]);

  // ── Scanner global de código de barras ───────────────────
  // Captura sequência de teclas + Enter mesmo sem foco no campo de busca.
  // Fluxo: local → backend → toast de erro.
  // Regras:
  //   • Ignora input/textarea/select que NÃO sejam o campo de busca do PDV
  //   • Se foco no campo de busca: usa DOM value no Enter
  //   • Se foco fora de qualquer input: acumula buffer e processa no Enter
  //   • Local first: products[] por barcode exato
  //   • Fallback: GET /api/products/barcode/:code se não encontrado localmente
  // ── Derived / computed ────────────────────────────────────
  const cartEntries = Object.values(cart);
  const subtotal = cartTotal(cart);
  const discountAmt = discountVal
    ? (discountType === 'percent'
        ? Math.min(subtotal, subtotal * parseFloat(discountVal) / 100)
        : Math.min(subtotal, parseFloat(discountVal)))
    : 0;
  const delivFeeAmt = deliveryMode === 'delivery' ? parseFloat(delivFee || 0) : 0;
  const totalAmt = Math.max(0, subtotal - discountAmt + delivFeeAmt);
  const troco = payMethod === 'cash' && cashReceived
    ? Math.max(0, parseFloat(cashReceived) - totalAmt)
    : 0;

  // Split payment derived
  const splitTotal     = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitRemaining = parseFloat((totalAmt - splitTotal).toFixed(2));
  const splitOk        = Math.abs(splitRemaining) < 0.02;

  const delivTab = DELIVERY_TABS.find((t) => t.id === deliveryMode) ?? DELIVERY_TABS[0];

  // ── Filtered products ─────────────────────────────────────
  const visibleProducts = useMemo(() => {
    let list = products;
    if (selCat !== 'todos') list = list.filter((p) => p.category_id === selCat || p.category_name === selCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [products, selCat, search]);

  // ── Customer autocomplete ─────────────────────────────────
  const handleCustInput = (val) => {
    setCustomerName(val);
    setCustomerId(null);
    clearTimeout(custTimer.current);
    if (val.length < 2) { setCustSuggestions([]); setCustSearch(false); return; }
    custTimer.current = setTimeout(async () => {
      try {
        const { data } = await searchCustomers(val, 6);
        setCustSuggestions(data?.data ?? data ?? []);
        setCustSearch(true);
      } catch { setCustSearch(false); }
    }, 300);
  };

  const applyCust = (c) => {
    setCustomerName(c.name ?? c.customer_name ?? '');
    setCustomerPhone(c.phone ?? c.customer_phone ?? '');
    setCustomerId(c.id ?? null);
    setCustSuggestions([]);
    setCustSearch(false);
  };

  // ── Add product to cart ───────────────────────────────────
  const handleAddProduct = useCallback(async (product) => {
    const hasVars = (product.variations ?? []).filter((g) => g.options?.length > 0).length > 0;

    if (hasVars) {
      setVarPicker({ product, selections: {} });
      return;
    }

    // Check for addons
    try {
      const { data } = await getProductAddonGroups(product.id);
      const groups = data?.data ?? data ?? [];
      if (groups.length > 0) {
        setAddonPicker({ product, groups });
        return;
      }
    } catch { /* no addons */ }

    // Simple add
    setCart((prev) => {
      const existing = prev[product.id];
      if (existing && !existing.variation && !existing.addons?.length) {
        return { ...prev, [product.id]: { ...existing, qty: existing.qty + 1 } };
      }
      return { ...prev, [product.id]: { product, qty: 1, weightKg: '', addons: [], notes: '', variation: null, choices: null } };
    });
    setToast({ msg: `Adicionado: ${product.name}`, type: 'success' });
  }, [setToast]);

  // ── Scanner global de barcode ─────────────────────────────
  // Deve ficar após handleAddProduct (evita TDZ no dep array em produção).
  const scanning = useRef(false);
  useEffect(() => {
    const onKey = async (e) => {
      const active     = document.activeElement;
      const tag        = active?.tagName?.toLowerCase();
      const isEditable = (tag === 'input' || tag === 'textarea' || tag === 'select');
      const isSearch   = active === searchRef.current;

      if (isEditable && !isSearch) return;

      if (e.key === 'Enter') {
        const code = isSearch
          ? (searchRef.current?.value ?? '').trim()
          : scanBuffer.current.trim();

        scanBuffer.current = '';
        clearTimeout(scanTimer.current);

        if (code.length < 2) return;
        if (scanning.current) return;
        scanning.current = true;

        try {
          let found = products.find((p) => p.barcode && p.barcode.trim() === code);

          if (!found) {
            try {
              const { data } = await getByBarcode(code);
              found = data?.data ?? null;
            } catch { /* produto não existe */ }
          }

          if (found) {
            e.preventDefault();
            handleAddProduct(found);
            if (isSearch) setSearch('');
            setToast({ msg: `Adicionado: ${found.name}`, type: 'success' });
          } else {
            setToast({ msg: `Produto não encontrado para o código: ${code}`, type: 'error' });
          }
        } finally {
          scanning.current = false;
        }
        return;
      }

      if (!isSearch && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBuffer.current += e.key;
        clearTimeout(scanTimer.current);
        scanTimer.current = setTimeout(() => { scanBuffer.current = ''; }, 300);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(scanTimer.current);
    };
  }, [products, handleAddProduct]);

  // Confirm variation
  const confirmVariation = () => {
    if (!varPicker) return;
    const { product, selections } = varPicker;
    const varArray = Object.entries(selections).map(([gid, sel]) => ({
      groupId: gid, groupName: sel.groupName || '', optionId: sel.optionId, optionName: sel.optionName, price: sel.price,
    }));
    // Check addons next
    getProductAddonGroups(product.id)
      .then(({ data }) => {
        const groups = data?.data ?? data ?? [];
        setVarPicker(null);
        if (groups.length > 0) {
          setPendingAdd({ product, variation: varArray });
          setAddonPicker({ product, groups });
        } else {
          setCart((prev) => ({
            ...prev,
            [`${product.id}_${Date.now()}`]: { product, qty: 1, weightKg: '', addons: [], notes: '', variation: varArray, choices: null },
          }));
        }
      })
      .catch(() => {
        setVarPicker(null);
        setCart((prev) => ({
          ...prev,
          [`${product.id}_${Date.now()}`]: { product, qty: 1, weightKg: '', addons: [], notes: '', variation: varArray, choices: null },
        }));
      });
  };

  // Confirm addons
  const confirmAddons = (addons) => {
    const variation = pendingAdd?.variation ?? null;
    const product = addonPicker.product;
    const key = variation ? `${product.id}_${Date.now()}` : product.id;
    setCart((prev) => {
      const existing = prev[key];
      if (existing && !variation && !addons.length) {
        return { ...prev, [key]: { ...existing, qty: existing.qty + 1 } };
      }
      return { ...prev, [key]: { product, qty: 1, weightKg: '', addons, notes: '', variation, choices: null } };
    });
    setAddonPicker(null);
    setPendingAdd(null);
  };

  // Cart qty / remove
  const updateQty = (key, delta) => {
    setCart((prev) => {
      const entry = prev[key];
      if (!entry) return prev;
      const newQty = (entry.qty ?? 1) + delta;
      if (newQty <= 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: { ...entry, qty: newQty } };
    });
  };
  const updateWeight = (key, val) => setCart((prev) => ({ ...prev, [key]: { ...prev[key], weightKg: val } }));
  const updateNotes  = (key, val) => setCart((prev) => ({ ...prev, [key]: { ...prev[key], notes: val } }));
  const removeItem   = (key) => setCart((prev) => { const n = { ...prev }; delete n[key]; return n; });

  // ── Split payment handlers ────────────────────────────────
  const addSplit    = () => setSplits((prev) => [...prev, { id: Date.now(), method: 'cash', amount: '', receivedAmount: '', fiadoClienteId: '' }]);
  const removeSplit = (idx) => setSplits((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  const updateSplit = (idx, upd) => setSplits((prev) => prev.map((s, i) => i === idx ? { ...s, ...upd } : s));

  const toggleSplitMode = () => {
    setSplitMode((v) => {
      if (!v) setSplits([{ id: 1, method: payMethod || 'cash', amount: String(totalAmt || ''), receivedAmount: '', fiadoClienteId: '' }]);
      else setSplits([{ id: 1, method: 'cash', amount: '', receivedAmount: '', fiadoClienteId: '' }]);
      return !v;
    });
  };

  // ── Segurar pedido ────────────────────────────────────────
  const holdOrder = () => {
    if (cartEntries.length === 0) { setToast({ msg: 'Carrinho vazio', type: 'warn' }); return; }
    const newHeld = {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      cart,
      customerName,
      customerPhone,
      customerId,
      deliveryMode,
      tableNumber,
      payMethod,
      discountType,
      discountVal,
      orderNotes,
      total: totalAmt,
      splitMode,
      splits: splitMode ? splits.map((s) => ({ ...s })) : null,
    };
    const updated = [...held, newHeld];
    setHeld(updated);
    saveHeld(updated);
    clearForm();
    setToast({ msg: 'Pedido segurado!', type: 'success' });
  };

  const restoreHeld = (idx) => {
    const h = held[idx];
    setCart(h.cart);
    setCustomerName(h.customerName || '');
    setCustomerPhone(h.customerPhone || '');
    setCustomerId(h.customerId || null);
    setDeliveryMode(h.deliveryMode || 'balcao');
    setTableNumber(h.tableNumber || '');
    setPayMethod(h.payMethod || 'cash');
    setDiscountType(h.discountType || 'fixed');
    setDiscountVal(h.discountVal || '');
    setOrderNotes(h.orderNotes || '');
    if (h.splitMode && Array.isArray(h.splits) && h.splits.length > 0) {
      setSplitMode(true);
      setSplits(h.splits);
    } else {
      setSplitMode(false);
      setSplits([{ id: 1, method: h.payMethod || 'cash', amount: '', receivedAmount: '', fiadoClienteId: '' }]);
    }
    const updated = held.filter((_, i) => i !== idx);
    setHeld(updated);
    saveHeld(updated);
    setShowHeld(false);
    setToast({ msg: 'Pedido recuperado!', type: 'success' });
  };

  const deleteHeld = (idx) => {
    const updated = held.filter((_, i) => i !== idx);
    setHeld(updated);
    saveHeld(updated);
  };

  // ── Clear form ────────────────────────────────────────────
  const clearForm = () => {
    setCart({});
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(null);
    setShowCustForm(false);
    setDeliveryMode('balcao');
    setTableNumber('');
    setDelivStreet(''); setDelivNumber(''); setDelivNeigh(''); setDelivFee('');
    setPayMethod('cash');
    setCashReceived('');
    setDiscountType('fixed');
    setDiscountVal('');
    setOrderNotes('');
    setFiadoClienteId('');
    setFiadoSearch('');
    setCustSuggestions([]);
    setSplitMode(false);
    setSplits([{ id: 1, method: 'cash', amount: '', receivedAmount: '', fiadoClienteId: '' }]);
  };

  // ── Finalizar venda ───────────────────────────────────────
  const finalizeSale = async (sendToKitchen = false) => {
    if (cartEntries.length === 0) { setToast({ msg: 'Adicione itens ao pedido', type: 'warn' }); return; }
    if (!caixa) { setShowOpenCaixa(true); return; }
    if (deliveryMode === 'delivery' && !customerPhone.trim()) {
      setToast({ msg: 'Telefone obrigatório para delivery', type: 'error' }); return;
    }
    if (deliveryMode === 'mesa' && !tableNumber.trim()) {
      setToast({ msg: 'Informe o número da mesa', type: 'error' }); return;
    }

    // Validação de pagamento
    if (splitMode) {
      if (splits.some((s) => !(parseFloat(s.amount) > 0))) {
        setToast({ msg: 'Preencha o valor de cada forma de pagamento', type: 'error' }); return;
      }
      if (!splitOk) {
        const diff = Math.abs(splitRemaining).toFixed(2);
        const msg  = splitRemaining > 0
          ? `Falta R$ ${diff} para fechar o total`
          : `Excesso de R$ ${diff} nos pagamentos`;
        setToast({ msg, type: 'error' }); return;
      }
      if (splits.some((s) => s.method === 'fiado' && !s.fiadoClienteId)) {
        setToast({ msg: 'Selecione o cliente fiado em cada parcela fiada', type: 'error' }); return;
      }
    } else {
      if (payMethod === 'fiado' && !fiadoClienteId) {
        setToast({ msg: 'Selecione o cliente do fiado', type: 'error' }); return;
      }
    }

    setSubmitting(true);
    try {
      const address = deliveryMode === 'delivery'
        ? `${delivStreet}${delivNumber ? ', ' + delivNumber : ''}${delivNeigh ? ' - ' + delivNeigh : ''}`
        : null;

      // Monta payments[] — sempre enviado (1 item no modo único, N no dividido)
      const paymentsArr = splitMode
        ? splits.map((s) => ({
            method:           s.method,
            amount:           parseFloat(s.amount),
            received_amount:  s.method === 'cash' && s.receivedAmount ? parseFloat(s.receivedAmount) : null,
            change_amount:    s.method === 'cash' && s.receivedAmount
              ? Math.max(0, parseFloat(s.receivedAmount) - parseFloat(s.amount))
              : null,
            fiado_cliente_id: s.method === 'fiado' ? s.fiadoClienteId : null,
          }))
        : [{
            method:           payMethod,
            amount:           totalAmt,
            received_amount:  payMethod === 'cash' && cashReceived ? parseFloat(cashReceived) : null,
            change_amount:    payMethod === 'cash' && troco > 0 ? parseFloat(troco.toFixed(2)) : null,
            fiado_cliente_id: payMethod === 'fiado' ? fiadoClienteId : null,
          }];

      const primaryMethod = splitMode
        ? (new Set(splits.map((s) => s.method)).size === 1 ? splits[0].method : 'mixed')
        : payMethod;

      const payload = {
        customerName:    customerName.trim() || 'Consumidor Final',
        customerPhone:   customerPhone.trim() || null,
        customerId:      customerId || null,
        deliveryType:    delivTab.deliveryType,
        channel:         delivTab.channel,
        items:           buildItems(cart),
        paymentMethod:   primaryMethod,
        payments:        paymentsArr,
        notes:           [
          orderNotes.trim(),
          deliveryMode === 'mesa' ? `Mesa ${tableNumber}` : '',
        ].filter(Boolean).join(' | ') || null,
        neighborhood:    delivNeigh || null,
        customerAddress: address,
        deliveryFee:     delivFeeAmt > 0 ? delivFeeAmt : undefined,
        tableNumber:     deliveryMode === 'mesa' ? tableNumber.trim() || null : null,
        // cashChangeFor apenas no modo único (split usa change_amount em payments[])
        cashChangeFor:   !splitMode && payMethod === 'cash' && cashReceived ? parseFloat(cashReceived) : null,
        ...(discountAmt > 0 ? { adjustmentType: 'discount', adjustmentValue: discountAmt } : {}),
      };

      await createOrder(payload);

      setToast({ msg: sendToKitchen ? 'Enviado para cozinha!' : 'Venda finalizada!', type: 'success' });
      clearForm();
      // fire-and-forget — falha no refresh não cancela a venda já criada
      refreshCaixa().catch(() => {});
    } catch (err) {
      const msg = err?.response?.data?.message || 'Erro ao finalizar venda';
      setToast({ msg, type: 'error' });
      if (err?.response?.status === 403 || msg.toLowerCase().includes('caixa')) {
        setShowOpenCaixa(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Impressão — pré-conta do carrinho ────────────────────
  const handlePrint = () => {
    if (cartEntries.length === 0) {
      setToast({ msg: 'Adicione itens antes de imprimir.', type: 'warn' });
      return;
    }
    const result = printPdvCart(cart, {
      customerName, customerPhone,
      deliveryMode, tableNumber,
      delivStreet, delivNumber, delivNeigh, delivFee,
      payMethod, cashReceived,
      totalAmt, discountAmt, troco,
      orderNotes, splitMode, splits,
    });
    if (result === false) {
      setToast({ msg: 'Impressão bloqueada. Permita popups para este site.', type: 'warn' });
    }
  };

  // ── Open caixa ────────────────────────────────────────────
  const handleOpenCaixa = async (body) => {
    await openCaixa(body);
    setShowOpenCaixa(false);
    await refreshCaixa();
    setToast({ msg: 'Caixa aberto!', type: 'success' });
  };

  // ── Render ────────────────────────────────────────────────
  const caixaOpen = !!caixa;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-white/[0.06] shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate?.('orders')}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Voltar para Pedidos"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="text-sm font-black text-white leading-tight">PDV ZapFome</p>
            <p className="text-[10px] text-gray-500 truncate">{tenant.name ?? 'Restaurante'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status caixa */}
          {caixaLoading ? (
            <div className="h-7 w-24 bg-gray-800 rounded-full animate-pulse" />
          ) : caixaOpen ? (
            <div className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-bold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Caixa aberto
            </div>
          ) : (
            <button
              onClick={() => setShowOpenCaixa(true)}
              className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/25 text-red-400 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-500/25 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Caixa fechado — Abrir
            </button>
          )}

          {/* Pedidos segurados */}
          <button
            onClick={() => setShowHeld(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-semibold transition-colors border border-white/[0.06]"
          >
            📋 Em espera
            {held.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-[10px] text-white font-black flex items-center justify-center">
                {held.length}
              </span>
            )}
          </button>

          {/* Atendente */}
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
              {(user.name ?? 'A')[0].toUpperCase()}
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-xs font-semibold text-gray-300 truncate leading-tight">{user.name ?? 'Atendente'}</p>
              <p className="text-[10px] text-gray-600 capitalize">Atendente</p>
            </div>
          </div>

          <Clock />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ══ Painel esquerdo: Produtos ════════════════════════ */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-white/[0.06]">

          {/* Busca + categorias */}
          <div className="px-3 py-2.5 bg-gray-900/50 border-b border-white/[0.06] space-y-2 shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Buscar produto por nome ou código..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input w-full pl-8 text-sm"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                )}
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => setSelCat('todos')}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${selCat === 'todos' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-white/[0.06]'}`}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id ?? cat.name}
                  onClick={() => setSelCat(cat.id ?? cat.name)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    selCat === (cat.id ?? cat.name)
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                      : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-white/[0.06]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de produtos */}
          <div className="flex-1 overflow-y-auto p-3">
            {prodLoad ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-gray-800/60 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-600 gap-2 mt-8">
                <span className="text-4xl">📦</span>
                <p className="text-sm">Nenhum produto encontrado</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {visibleProducts.map((p) => {
                  const count = Object.values(cart)
                    .filter((e) => e.product.id === p.id)
                    .reduce((s, e) => s + (e.qty || 0), 0);
                  return (
                    <ProductCard key={p.id} product={p} inCart={count || 0} onAdd={handleAddProduct} />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══ Painel direito: Pedido ═══════════════════════════ */}
        <div className="w-[420px] xl:w-[460px] shrink-0 flex flex-col bg-gray-900/50 overflow-hidden">

          {/* ── Cliente ───────────────────────────────────────── */}
          <div className="px-3 py-2 border-b border-white/[0.06] shrink-0">
            {showCustForm ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Cliente</p>
                  <button onClick={() => setShowCustForm(false)}
                    className="text-[10px] text-gray-600 hover:text-gray-300 transition-colors">✕ Fechar</button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Nome do cliente..."
                    value={customerName}
                    onChange={(e) => handleCustInput(e.target.value)}
                    onFocus={() => customerName.length >= 2 && setCustSearch(true)}
                    onBlur={() => setTimeout(() => setCustSearch(false), 150)}
                    className="input w-full text-sm pr-8"
                    autoFocus
                  />
                  {customerName && (
                    <button onClick={() => { setCustomerName(''); setCustomerPhone(''); setCustomerId(null); setCustSuggestions([]); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                  )}
                  <AnimatePresence>
                    {custSearch && custSuggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden"
                      >
                        {custSuggestions.map((c, i) => (
                          <button key={i} onMouseDown={() => applyCust(c)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors border-b border-white/[0.04] last:border-0">
                            <p className="text-sm text-gray-200 font-medium truncate">{c.name ?? c.customer_name}</p>
                            {(c.phone ?? c.customer_phone) && <p className="text-xs text-gray-500">{c.phone ?? c.customer_phone}</p>}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <input
                  type="tel"
                  placeholder="Telefone (obrigatório para delivery)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="input w-full text-sm"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-gray-600 text-base shrink-0">👤</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-200 truncate leading-tight">
                      {customerName || 'Consumidor Final'}
                    </p>
                    {customerPhone && <p className="text-[10px] text-gray-500 leading-tight">📱 {customerPhone}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {customerName && (
                    <button
                      onClick={() => { setCustomerName(''); setCustomerPhone(''); setCustomerId(null); setCustSuggestions([]); }}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs"
                    >✕</button>
                  )}
                  <button
                    onClick={() => setShowCustForm(true)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-white/10 transition-colors whitespace-nowrap"
                  >
                    {customerName ? 'Editar' : 'Identificar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Tipo de pedido ────────────────────────────────── */}
          <div className="px-3 py-2 border-b border-white/[0.06] shrink-0">
            <div className="grid grid-cols-4 gap-1">
              {DELIVERY_TABS.map((tab) => (
                <button key={tab.id} onClick={() => setDeliveryMode(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${
                    deliveryMode === tab.id
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                      : 'bg-gray-800/50 text-gray-500 border-white/[0.05] hover:text-gray-300'
                  }`}
                >
                  <span className="text-xs">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mesa / Comanda */}
            {deliveryMode === 'mesa' && (
              <input
                type="text" placeholder="Número da mesa / comanda"
                value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}
                className="input w-full text-sm mt-2"
                autoFocus
              />
            )}

            {/* Delivery: endereço simplificado */}
            {deliveryMode === 'delivery' && (
              <div className="mt-2 space-y-1.5">
                <input type="text" placeholder="Rua / Logradouro" value={delivStreet}
                  onChange={(e) => setDelivStreet(e.target.value)} className="input w-full text-xs" />
                <div className="flex gap-1.5">
                  <input type="text" placeholder="Número" value={delivNumber}
                    onChange={(e) => setDelivNumber(e.target.value)} className="input flex-1 text-xs" />
                  <input type="text" placeholder="Bairro" value={delivNeigh}
                    onChange={(e) => setDelivNeigh(e.target.value)} className="input flex-1 text-xs" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Taxa R$</span>
                  <input type="number" min="0" step="0.50" placeholder="0,00" value={delivFee}
                    onChange={(e) => setDelivFee(e.target.value)} className="input flex-1 text-xs text-right" />
                </div>
              </div>
            )}
          </div>

          {/* ── Itens do carrinho ─────────────────────────────── */}
          <div className="px-3 pt-2 pb-0 flex items-center justify-between shrink-0">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Itens do pedido{cartEntries.length > 0 && <span className="text-orange-400 ml-1">({cartEntries.length})</span>}
            </p>
            {cartEntries.length > 0 && (
              <span className="text-[10px] text-gray-600">{fmt(subtotal)}</span>
            )}
          </div>
          <div className="flex-1 min-h-[200px] overflow-y-auto px-3 py-2 space-y-2">
            {cartEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-gray-600 gap-2">
                <span className="text-3xl">🛒</span>
                <p className="text-xs italic text-center">Selecione produtos à esquerda</p>
              </div>
            ) : (
              cartEntries.map(({ product, qty, weightKg, addons, notes, variation }, idx) => {
                const key = Object.keys(cart)[idx];
                const basePrice = itemBasePrice({ product, variation });
                const units = product.sale_type === 'kg' ? parseFloat(weightKg || 0) : qty;
                const lineTotal = basePrice * units + (addons ?? []).reduce((s, a) => s + parseFloat(a.unit_price || 0) * (a.qty || 1), 0) * (product.sale_type === 'kg' ? 1 : qty);
                return (
                  <div key={key} className="bg-gray-800/60 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-100 leading-tight">{product.name}</p>
                        {variation?.length > 0 && (
                          <p className="text-xs text-orange-400 leading-none mt-0.5">
                            {variation.map((s) => s.optionName).join(' · ')}
                          </p>
                        )}
                        {addons?.length > 0 && (
                          <p className="text-xs text-gray-500">
                            {addons.map((a) => `+${a.addon_name}`).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-sm font-black text-white tabular-nums">{fmt(lineTotal)}</span>
                        <button onClick={() => removeItem(key)} className="text-gray-600 hover:text-red-400 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {product.sale_type === 'kg' ? (
                      <div className="flex items-center gap-2">
                        <input type="number" min="0.1" step="0.1" value={weightKg}
                          onChange={(e) => updateWeight(key, e.target.value)}
                          className="input w-16 text-xs py-0.5 text-center" placeholder="kg" />
                        <span className="text-[10px] text-gray-500">kg × {fmt(basePrice)}/kg</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateQty(key, -1)}
                          className="w-6 h-6 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold flex items-center justify-center">−</button>
                        <span className="w-7 text-center text-sm font-bold text-white">{qty}</span>
                        <button onClick={() => updateQty(key, +1)}
                          className="w-6 h-6 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold flex items-center justify-center">+</button>
                        <span className="ml-1 text-xs text-gray-500">{fmt(basePrice)}/un</span>
                      </div>
                    )}

                    <input
                      type="text"
                      value={notes ?? ''}
                      onChange={(e) => updateNotes(key, e.target.value)}
                      placeholder="Obs.: sem cebola..."
                      className="w-full text-[11px] bg-gray-700/60 border border-white/10 rounded-lg px-2 py-1 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* ── Resumo + Pagamento ────────────────────────────── */}
          <div className="border-t border-white/[0.06] shrink-0 overflow-y-auto max-h-[300px]">
          <div className="px-3 py-2 space-y-2">

            {/* Desconto */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Desconto</span>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}
                className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none shrink-0">
                <option value="fixed">R$</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number" min="0" step="0.01"
                placeholder={discountType === 'percent' ? '0' : '0,00'}
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                className="input flex-1 text-xs text-right"
              />
            </div>

            {/* Totais */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Desconto</span>
                  <span>− {fmt(discountAmt)}</span>
                </div>
              )}
              {delivFeeAmt > 0 && (
                <div className="flex justify-between text-gray-400">
                  <span>Taxa entrega</span>
                  <span>{fmt(delivFeeAmt)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm text-white pt-1 border-t border-white/[0.06]">
                <span>TOTAL</span>
                <span className="text-orange-400">{fmt(totalAmt)}</span>
              </div>
            </div>

            {/* Formas de pagamento */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Pagamento</p>
                <button
                  onClick={toggleSplitMode}
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold border transition-colors ${
                    splitMode
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                      : 'bg-gray-800 text-gray-500 border-white/10 hover:text-gray-300'
                  }`}
                >
                  ÷ {splitMode ? 'Dividido ✓' : 'Dividir'}
                </button>
              </div>

              {!splitMode ? (
                <>
                  {/* Grade de métodos — modo único */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {PDV_PAY.map(({ value, label }) => {
                      const [icon, ...rest] = label.split(' ');
                      const name = rest.join(' ');
                      const active = payMethod === value;
                      const activeCls =
                        value === 'cash'    ? 'border-green-400 bg-green-500/15 text-green-300' :
                        value === 'pix'     ? 'border-blue-400 bg-blue-500/15 text-blue-300' :
                        value === 'credit'  ? 'border-violet-400 bg-violet-500/15 text-violet-300' :
                        value === 'debit'   ? 'border-indigo-400 bg-indigo-500/15 text-indigo-300' :
                        value === 'fiado'   ? 'border-purple-400 bg-purple-500/15 text-purple-300' :
                        value === 'voucher' ? 'border-yellow-400 bg-yellow-500/15 text-yellow-300' :
                        'border-orange-400 bg-orange-500/15 text-orange-300';
                      return (
                        <button key={value} type="button"
                          onClick={() => { setPayMethod(value); setFiadoClienteId(''); setFiadoSearch(''); }}
                          className={[
                            'flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-bold border-2 transition-all',
                            active ? activeCls : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300 bg-gray-800/40',
                          ].join(' ')}
                        >
                          <span className="text-xs">{icon}</span>
                          <span>{name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Troco — modo único dinheiro */}
                  {payMethod === 'cash' && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-[10px] text-gray-500 mb-1">Valor recebido</p>
                        <input type="number" min="0" step="0.01" placeholder="0,00"
                          value={cashReceived} onChange={(e) => setCashReceived(e.target.value)}
                          className="input w-full text-sm font-bold text-right" />
                      </div>
                      {troco > 0 && (
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] text-gray-500">Troco</p>
                          <p className="text-sm font-black text-green-400">{fmt(troco)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fiado — modo único */}
                  {payMethod === 'fiado' && (
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-500 mb-1">Cliente do Fiado</p>
                      <input type="text" placeholder="Buscar cliente fiado..."
                        value={fiadoSearch}
                        onChange={(e) => setFiadoSearch(e.target.value)}
                        className="input w-full text-xs mb-1"
                      />
                      <div className="max-h-24 overflow-auto space-y-0.5">
                        {fiadoClientes
                          .filter((c) => !fiadoSearch || c.name?.toLowerCase().includes(fiadoSearch.toLowerCase()) || c.phone?.includes(fiadoSearch))
                          .map((c) => (
                            <button key={c.id} onClick={() => { setFiadoClienteId(c.id); setFiadoSearch(c.name || c.phone || ''); }}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${fiadoClienteId === c.id ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'}`}
                            >
                              {c.name} {c.phone ? `· ${c.phone}` : ''}
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── Modo dividido ─────────────────────────────── */
                <div className="space-y-1.5">
                  {splits.map((s, i) => (
                    <SplitPaymentRow
                      key={s.id}
                      split={s}
                      totalCount={splits.length}
                      onUpdate={(upd) => updateSplit(i, upd)}
                      onRemove={() => removeSplit(i)}
                      fiadoClientes={fiadoClientes}
                    />
                  ))}

                  <button
                    onClick={addSplit}
                    className="w-full py-1.5 rounded-xl bg-gray-800/50 hover:bg-gray-700/60 text-gray-500 hover:text-gray-300 text-[11px] font-semibold border border-dashed border-white/10 transition-colors"
                  >
                    + Adicionar forma
                  </button>

                  {/* Resumo do split */}
                  <div className="space-y-0.5 text-[11px] pt-1.5 border-t border-white/[0.06]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total do pedido</span>
                      <span className="text-white font-bold">{fmt(totalAmt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total informado</span>
                      <span className={splitOk ? 'text-green-400 font-bold' : splitTotal > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                        {fmt(splitTotal)}
                      </span>
                    </div>
                    {splitRemaining > 0.01 && (
                      <div className="flex justify-between text-red-400 font-bold">
                        <span>Falta</span>
                        <span>{fmt(splitRemaining)}</span>
                      </div>
                    )}
                    {splitRemaining < -0.01 && (
                      <div className="flex justify-between text-yellow-400 font-bold">
                        <span>Excesso</span>
                        <span>{fmt(-splitRemaining)}</span>
                      </div>
                    )}
                    {splitOk && (
                      <p className="text-center text-[10px] text-green-500 font-bold pt-0.5">✓ Pagamentos fechados</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Observação geral */}
            <textarea
              rows={1}
              placeholder="Observação do pedido..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="w-full text-xs bg-gray-800/60 border border-white/[0.08] rounded-xl px-3 py-2 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-500/40 resize-none"
            />
          </div>
          </div>
        </div>
      </div>

      {/* ── Footer: ações ──────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-900 border-t border-white/[0.06] shrink-0">
        <button onClick={clearForm}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-semibold transition-colors border border-white/[0.06]">
          ➕ Novo
        </button>
        <button onClick={holdOrder}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-300 text-xs font-semibold transition-colors border border-yellow-500/20">
          ⏸ Segurar
        </button>
        <button onClick={() => finalizeSale(true)} disabled={submitting || cartEntries.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-semibold transition-colors border border-blue-500/20 disabled:opacity-40">
          👨‍🍳 Cozinha
        </button>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-semibold transition-colors border border-white/[0.06]">
          🖨 Imprimir
        </button>
        <button
          onClick={() => finalizeSale(false)}
          disabled={submitting || cartEntries.length === 0 || !caixaOpen || (splitMode && !splitOk)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="animate-pulse">Processando...</span>
          ) : splitMode ? (
            <>✅ Finalizar — {fmt(totalAmt)}{!splitOk && <span className="text-red-300 text-xs ml-1">(falta {fmt(Math.abs(splitRemaining))})</span>}</>
          ) : (
            <>✅ Finalizar Venda — {fmt(totalAmt)}</>
          )}
        </button>
      </div>

      {/* ── Modais / overlays ──────────────────────────────── */}
      <AnimatePresence>
        {showOpenCaixa && (
          <OpenCaixaModal key="open-caixa" onOpen={handleOpenCaixa} onClose={() => setShowOpenCaixa(false)} />
        )}
        {varPicker && (
          <VariationPicker
            key="var-picker"
            product={varPicker.product}
            selections={varPicker.selections}
            onSelect={(gid, sel) => setVarPicker((v) => ({ ...v, selections: { ...v.selections, [gid]: sel } }))}
            onConfirm={confirmVariation}
            onClose={() => setVarPicker(null)}
          />
        )}
        {addonPicker && (
          <AddonPicker
            key="addon-picker"
            product={addonPicker.product}
            groups={addonPicker.groups}
            onConfirm={confirmAddons}
            onClose={() => { setAddonPicker(null); setPendingAdd(null); }}
          />
        )}
        {showHeld && (
          <HeldDrawer
            key="held-drawer"
            held={held}
            onRestore={restoreHeld}
            onDelete={deleteHeld}
            onClose={() => setShowHeld(false)}
          />
        )}
        {toast && (
          <Toast key="toast" msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
