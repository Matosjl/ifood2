import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPublicMenu, createPublicOrder, trackPublicOrder,
  getPublicCustomer, submitPublicRating, getPublicOrderHistory,
} from './api/public';
import DeliveryMapPicker from './components/DeliveryMapPicker';
import SplashScreen from './components/SplashScreen';

// ── Helpers ────────────────────────────────────────────────────

const fmtBRL = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2).replace('.', ',')}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const PROFILE_KEY = (slug) => `customer_profile_${slug}`;
const loadProfile  = (slug) => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY(slug)) || 'null'); } catch { return null; } };
const saveProfile  = (slug, p) => { try { localStorage.setItem(PROFILE_KEY(slug), JSON.stringify(p)); } catch {} };

const emptyCart = () => ({});

const addToCart = (cart, product, addons = []) => {
  const prev = cart[product.id];
  if (prev && addons.length === 0 && (!prev.addons || prev.addons.length === 0)) {
    return product.sale_type === 'kg'
      ? cart
      : { ...cart, [product.id]: { ...prev, qty: prev.qty + 1 } };
  }
  return { ...cart, [product.id]: { product, qty: 1, weightKg: '', addons } };
};

const removeFromCart = (cart, id) => { const n = { ...cart }; delete n[id]; return n; };

const addonLinePrice = (addons = []) =>
  addons.reduce((s, a) => s + parseFloat(a.unit_price || 0) * (a.qty || 1), 0);

const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg, addons = [] }) => {
    const base = product.sale_type === 'kg'
      ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
      : parseFloat(product.sale_price) * (qty || 0);
    return sum + base + addonLinePrice(addons) * (product.sale_type === 'kg' ? 1 : (qty || 0));
  }, 0);

const cartCount = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) =>
    sum + (product.sale_type === 'kg' ? (parseFloat(weightKg) > 0 ? 1 : 0) : qty), 0);

// ── Status config ──────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'received',  label: 'Pedido Recebido', icon: '📋', desc: 'Aguardando confirmação do restaurante' },
  { key: 'preparing', label: 'Em Preparo',       icon: '👨‍🍳', desc: 'Seu pedido está sendo preparado com carinho' },
  { key: 'ready',     label: 'Pronto!',           icon: '✅', desc: 'Pronto para retirada ou saiu para entrega' },
  { key: 'delivered', label: 'Concluído',         icon: '🎉', desc: 'Pedido entregue. Aproveite sua refeição!' },
];

const STATUS_INDEX = {
  pending: 0, confirmed: 0, preparing: 1,
  ready: 2, delivered: 3, cancelled: -1,
};

const STATUS_LABEL = {
  pending: 'Aguardando', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', delivering: 'Saiu p/ entrega', delivered: 'Entregue', cancelled: 'Cancelado',
};

// ── Storage helpers ────────────────────────────────────────────

const STORAGE_KEY = (slug) => `last_order_${slug}`;

const saveOrder = (slug, order) => {
  try { localStorage.setItem(STORAGE_KEY(slug), JSON.stringify({ id: order.id, number: order.order_number ?? order.orderNumber, ts: Date.now() })); } catch {}
};
const loadOrder = (slug) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(slug));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.ts > 86_400_000) { localStorage.removeItem(STORAGE_KEY(slug)); return null; }
    return p;
  } catch { return null; }
};

// ── Icons ──────────────────────────────────────────────────────

const IconCart = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const IconBack = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const IconWhatsApp = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
const IconUser = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

// ── RatingModal ────────────────────────────────────────────────

function RatingModal({ slug, orderId, orderNumber, cashbackEarned, onClose }) {
  const [stars,      setStars]      = useState(0);
  const [hover,      setHover]      = useState(0);
  const [comment,    setComment]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);

  const LABELS = ['', 'Muito ruim 😞', 'Ruim 😕', 'Regular 😐', 'Bom 😊', 'Excelente! 🤩'];

  const handleSubmit = async () => {
    if (!stars) return;
    setSubmitting(true);
    try {
      await submitPublicRating(slug, { orderId, stars, comment: comment.trim() || undefined });
    } catch { /* avaliação é opcional */ } finally {
      setDone(true);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl shadow-2xl"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>

        {done ? (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="text-5xl">🙏</div>
            <h3 className="text-xl font-black text-gray-900">Obrigado pela avaliação!</h3>
            <p className="text-gray-500 text-sm">Seu feedback nos ajuda a melhorar sempre.</p>
            {cashbackEarned > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <p className="text-green-700 font-bold text-sm">
                  💰 Você ganhou <span className="text-green-600 text-base">{fmtBRL(cashbackEarned)}</span> de cashback!
                </p>
                <p className="text-green-600 text-xs mt-1">Use no seu próximo pedido 🎉</p>
              </div>
            )}
            <button onClick={onClose} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-colors">Fechar</button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            <div className="text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Pedido #{orderNumber}</p>
              <h3 className="text-lg font-black text-gray-900">Como foi sua experiência?</h3>
            </div>
            <div className="flex justify-center gap-3">
              {[1,2,3,4,5].map((s) => (
                <button key={s} onClick={() => setStars(s)} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
                  className="text-4xl transition-transform active:scale-90 hover:scale-110">
                  <span className={(hover || stars) >= s ? 'text-yellow-400' : 'text-gray-200'}>★</span>
                </button>
              ))}
            </div>
            {(hover > 0 || stars > 0) && (
              <p className="text-center text-sm font-semibold text-orange-600">{LABELS[hover || stars]}</p>
            )}
            <textarea placeholder="Deixe um comentário (opcional)..." value={comment}
              onChange={(e) => setComment(e.target.value)} rows={3} maxLength={500}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
            <div className="flex gap-3 pb-2">
              <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-500 font-bold text-sm">Agora não</button>
              <button onClick={handleSubmit} disabled={!stars || submitting}
                className="flex-[2] py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2">
                {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Enviando...</> : 'Enviar ⭐'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ProfileModal ───────────────────────────────────────────────

function ProfileModal({ slug, profile, onSave, onClose, cashbackEnabled }) {
  const [name,          setName]          = useState(profile?.name ?? '');
  const [phone,         setPhone]         = useState(profile?.phone ?? '');
  const [tab,           setTab]           = useState('profile'); // 'profile' | 'history'
  const [history,       setHistory]       = useState(null);
  const [loadingH,      setLoadingH]      = useState(false);
  const [loyaltyData,   setLoyaltyData]   = useState(null);
  const [loadingL,      setLoadingL]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState('');

  // Carrega dados de fidelidade e histórico ao abrir
  useEffect(() => {
    if (!profile?.phone) return;
    const digits = profile.phone.replace(/\D/g, '');
    if (!digits) return;

    if (cashbackEnabled) {
      setLoadingL(true);
      getPublicCustomer(slug, digits)
        .then(({ data }) => setLoyaltyData(data.data ?? null))
        .catch(() => {})
        .finally(() => setLoadingL(false));
    }
  }, [slug, profile?.phone, cashbackEnabled]);

  const loadHistory = () => {
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits.length < 10) return;
    setLoadingH(true);
    getPublicOrderHistory(slug, digits)
      .then(({ data }) => setHistory(data.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingH(false));
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'history' && history === null) loadHistory();
  };

  const handleSave = () => {
    if (!name.trim()) return setErr('Informe seu nome.');
    if (!phone.replace(/\D/g, '')) return setErr('Informe seu telefone.');
    setSaving(true);
    const p = { name: name.trim(), phone: phone.trim() };
    saveProfile(slug, p);
    onSave(p);
    setSaving(false);
    onClose();
  };

  const isNew = !profile;

  const STATUS_COLOR = { delivered: 'text-green-600', cancelled: 'text-red-500', pending: 'text-orange-500', preparing: 'text-blue-500', confirmed: 'text-blue-500', ready: 'text-purple-500' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh', animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>

        {/* Header */}
        <div className="px-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-gray-900 text-lg">
                {isNew ? 'Criar Perfil' : 'Editar Perfil'}
              </h3>
              {!isNew && profile.phone && (
                <p className="text-xs text-gray-400 mt-0.5">{profile.phone}</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Cashback balance */}
          {!isNew && loyaltyData && parseFloat(loyaltyData.cashback_balance) > 0 && (
            <div className="mt-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">💰</span>
              <div>
                <p className="text-sm font-black text-green-800">
                  {fmtBRL(loyaltyData.cashback_balance)} de cashback disponível
                </p>
                <p className="text-xs text-green-600">{loyaltyData.total_orders} {loyaltyData.total_orders === 1 ? 'pedido' : 'pedidos'} realizados</p>
              </div>
            </div>
          )}
          {!isNew && loadingL && (
            <div className="mt-3 h-14 bg-gray-100 rounded-2xl animate-pulse" />
          )}

          {/* CTA para novo usuário */}
          {isNew && cashbackEnabled && (
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <p className="text-sm font-bold text-orange-700">💰 Cadastre-se e ganhe cashback em cada pedido!</p>
              <p className="text-xs text-orange-500 mt-0.5">Acumule crédito e use como desconto.</p>
            </div>
          )}
        </div>

        {/* Tabs (só para perfil existente) */}
        {!isNew && (
          <div className="flex gap-2 px-5 pt-3 shrink-0">
            {[{ key: 'profile', label: '👤 Dados' }, { key: 'history', label: '🛍️ Histórico' }].map(({ key, label }) => (
              <button key={key} onClick={() => handleTabChange(key)}
                className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-colors ${tab === key ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Tab: Perfil / Formulário ── */}
          {(isNew || tab === 'profile') && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Nome completo *</label>
                <input type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400" autoComplete="name" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1.5">WhatsApp / Telefone *</label>
                <input type="tel" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400" autoComplete="tel" />
              </div>
              {err && <p className="text-sm text-red-500 font-medium">⚠️ {err}</p>}
              <button onClick={handleSave} disabled={saving}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-colors shadow-md">
                {saving ? 'Salvando...' : (isNew ? '✓ Criar Perfil' : '✓ Salvar Alterações')}
              </button>
              {!isNew && (
                <button onClick={() => { saveProfile(slug, null); onSave(null); onClose(); }}
                  className="w-full py-3 rounded-2xl border border-gray-200 text-gray-400 font-bold text-sm hover:bg-gray-50 transition-colors">
                  Remover perfil
                </button>
              )}
            </>
          )}

          {/* ── Tab: Histórico de pedidos ── */}
          {!isNew && tab === 'history' && (
            <div className="space-y-3">
              {loadingH ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
              ) : history === null ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Carregando histórico...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-4xl mb-3">🛍️</div>
                  <p className="font-semibold">Nenhum pedido encontrado</p>
                  <p className="text-sm mt-1">Seus pedidos aparecem aqui</p>
                </div>
              ) : (
                history.map((o) => (
                  <div key={o.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-black text-gray-800 text-sm">Pedido #{o.order_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(o.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-orange-600 text-sm">{fmtBRL(o.total)}</p>
                        <p className={`text-xs font-bold mt-0.5 ${STATUS_COLOR[o.status] ?? 'text-gray-500'}`}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {(o.items ?? []).slice(0, 3).map((it, i) => (
                        <p key={i} className="text-xs text-gray-500 truncate">
                          {it.weight_kg ? `${it.weight_kg}kg` : `${it.quantity}×`} {it.product_name}
                        </p>
                      ))}
                      {(o.items ?? []).length > 3 && (
                        <p className="text-xs text-gray-400">+{o.items.length - 3} item(s)</p>
                      )}
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <span className="text-[10px] bg-gray-200 text-gray-600 font-bold px-2 py-0.5 rounded-full">
                        {o.delivery_type === 'delivery' ? '🛵 Entrega' : '🏪 Retirada'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AddonPicker ────────────────────────────────────────────────

function AddonPicker({ product, groups, onConfirm, onClose }) {
  const [sel, setSel] = useState({});

  const groupCount = (gid) => Object.values(sel[gid] ?? {}).reduce((s, q) => s + q, 0);

  const toggle = (group, item) => {
    const gid = group.id, iid = item.id;
    const current = (sel[gid] ?? {})[iid] ?? 0;
    const max = group.max_qty ?? Infinity;
    setSel(prev => {
      const grp = { ...(prev[gid] ?? {}) };
      if (current > 0) { delete grp[iid]; }
      else {
        if (groupCount(gid) >= max) {
          if (max === 1) return { ...prev, [gid]: { [iid]: 1 } };
          return prev;
        }
        grp[iid] = 1;
      }
      return { ...prev, [gid]: grp };
    });
  };

  const handleConfirm = () => {
    const addons = [];
    for (const group of groups) {
      for (const [itemId, qty] of Object.entries(sel[group.id] ?? {})) {
        if (qty <= 0) continue;
        const item = group.items.find(i => i.id === itemId);
        if (!item) continue;
        addons.push({ addon_item_id: item.id, addon_name: item.name, qty, unit_price: parseFloat(item.price), total: parseFloat(item.price) * qty });
      }
    }
    onConfirm(addons);
  };

  const extrasTotal = groups.reduce((sum, group) =>
    sum + Object.entries(sel[group.id] ?? {}).reduce((s, [iid, qty]) => {
      const item = group.items.find(i => i.id === iid);
      return s + (item ? parseFloat(item.price) * qty : 0);
    }, 0), 0);

  const basePrice = parseFloat(product.sale_price);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '88vh', animation: 'slideUp 0.28s cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
        <div className="px-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-start gap-3">
            {product.image_url && (
              <img src={product.image_url} alt={product.display_name ?? product.name} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-gray-100" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-gray-900 text-base leading-tight">{product.display_name ?? product.name}</h3>
              <p className="text-orange-600 font-bold text-sm mt-0.5">{fmtBRL(basePrice)}</p>
            </div>
            <button onClick={onClose} className="shrink-0 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {groups.map((group) => {
            const count = groupCount(group.id);
            const max   = group.max_qty;
            const atMax = max !== null && max > 0 && count >= max;
            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-black text-gray-800 uppercase tracking-wider">{group.name}</p>
                    {group.description && <p className="text-[11px] text-gray-400 mt-0.5">{group.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {group.min_qty > 0 && <span className="text-[10px] bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">Obrigatório</span>}
                    <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">
                      {max === 1 ? 'Escolha 1' : max ? `máx ${max}` : 'à vontade'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const chosen = (sel[group.id] ?? {})[item.id] ?? 0;
                    const isSelected = chosen > 0;
                    const disabled   = !isSelected && atMax && max !== 1;
                    return (
                      <button key={item.id} onClick={() => !disabled && toggle(group, item)} disabled={disabled}
                        className={['w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left',
                          isSelected ? 'border-orange-400 bg-orange-50' : disabled ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed' : 'border-gray-200 hover:border-gray-300 bg-white active:bg-gray-50',
                        ].join(' ')}>
                        <div className={['w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                          isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300',
                        ].join(' ')}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                        <span className="flex-1 text-sm text-gray-800 font-medium">{item.name}</span>
                        {parseFloat(item.price) > 0 && (
                          <span className="text-orange-600 font-bold text-sm shrink-0">+{fmtBRL(item.price)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={handleConfirm}
            className="flex-2 flex-grow py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm transition-colors shadow-md active:scale-95">
            {extrasTotal > 0 ? `Adicionar · ${fmtBRL(basePrice + extrasTotal)}` : 'Adicionar ao carrinho'}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

// ── TrackingPage ───────────────────────────────────────────────

function TrackingPage({ order, tenant, onNewOrder, onBackToMenu, onRefresh, slug }) {
  const statusIdx  = STATUS_INDEX[order?.status] ?? 0;
  const cancelled  = order?.status === 'cancelled';
  const delivered  = order?.status === 'delivered';
  const isDelivery = order?.delivery_type === 'delivery';
  const whatsapp   = tenant?.whatsapp_number;
  const pct        = Math.round(((statusIdx + 1) / STATUS_STEPS.length) * 100);

  const [showRating, setShowRating] = useState(false);
  const ratingOpened = useRef(false);

  // Live elapsed timer
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!order?.created_at || delivered || cancelled) return;
    const update = () => {
      const ms = Date.now() - new Date(order.created_at).getTime();
      const m  = Math.floor(ms / 60_000);
      const s  = Math.floor((ms % 60_000) / 1000);
      setElapsed(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [order?.created_at, delivered, cancelled]);
  useEffect(() => {
    if (delivered && !order?.has_rating && !ratingOpened.current) {
      ratingOpened.current = true;
      const t = setTimeout(() => setShowRating(true), 1200);
      return () => clearTimeout(t);
    }
  }, [delivered, order?.has_rating]);

  const PAYMENT_MAP = { cash: '💵 Dinheiro', pix: '📱 Pix', credit: '💳 Crédito', debit: '💳 Débito', voucher: '🎫 Vale Ref.', other: '🔖 Outro' };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className={`relative text-white overflow-hidden ${cancelled ? 'bg-red-500' : delivered ? 'bg-green-600' : 'bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500'}`}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 0%, transparent 60%)' }} />
        <div className="relative px-5 pt-6 pb-8 text-center">
          <p className="text-xs font-bold opacity-75 uppercase tracking-widest mb-2">{tenant?.name ?? 'Restaurante'}</p>
          <div className="text-5xl mb-3">{cancelled ? '❌' : delivered ? '🎉' : '🍽️'}</div>
          <h1 className="text-2xl font-black">
            {cancelled ? 'Pedido Cancelado' : delivered ? 'Pedido Entregue!' : `Pedido #${order?.order_number ?? order?.orderNumber ?? '---'}`}
          </h1>
          <p className="text-sm opacity-80 mt-2">
            {isDelivery ? '🛵 Entrega' : '🏪 Retirada'}
            {order?.payment_method ? ` · ${PAYMENT_MAP[order.payment_method] ?? order.payment_method}` : ''}
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-5 space-y-4 pb-10">
        {cancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-bold">Seu pedido foi cancelado</p>
            <p className="text-red-500 text-sm mt-1">Entre em contato com o restaurante para mais informações.</p>
          </div>
        )}

        {!cancelled && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="h-1.5 bg-gray-100">
              <div className={`h-full transition-all duration-1000 ${delivered ? 'bg-green-500' : 'bg-gradient-to-r from-orange-400 to-amber-400'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="p-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-5">Acompanhe seu pedido</p>
              <div className="space-y-0">
                {STATUS_STEPS.map((step, idx) => {
                  const done = idx < statusIdx, current = idx === statusIdx, future = idx > statusIdx;
                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      <div className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
                        <div className={['w-10 h-10 rounded-full flex items-center justify-center text-base font-bold transition-all duration-500 shadow-sm',
                          done ? 'bg-green-500 text-white' : current ? 'bg-orange-500 text-white shadow-orange-200 shadow-md scale-110' : 'bg-gray-100 text-gray-300',
                        ].join(' ')}>
                          {done ? '✓' : step.icon}
                        </div>
                        {idx < STATUS_STEPS.length - 1 && (
                          <div className={`w-0.5 my-1 rounded-full transition-all duration-500 ${done ? 'h-8 bg-green-400' : 'h-8 bg-gray-200'}`} />
                        )}
                      </div>
                      <div className={`pb-6 flex-1 ${idx === STATUS_STEPS.length - 1 ? 'pb-2' : ''}`}>
                        <p className={['font-bold text-sm leading-tight mt-2', done ? 'text-green-600' : current ? 'text-orange-600' : 'text-gray-300'].join(' ')}>
                          {step.label}
                          {current && <span className="ml-2 inline-flex gap-0.5">{[0,1,2].map(i => <span key={i} className="w-1 h-1 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}</span>}
                        </p>
                        {(done || current) && <p className={`text-xs mt-0.5 ${current ? 'text-orange-400' : 'text-gray-400'}`}>{step.desc}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {!delivered && !cancelled && (
              <div className="px-5 pb-4 space-y-2">
                {elapsed && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">⏱️</span>
                      <span className="text-xs text-gray-500">Tempo aguardando</span>
                    </div>
                    <span className="text-sm font-black text-orange-500 tabular-nums">{elapsed}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                  <p className="text-[11px] text-gray-400">Atualizado automaticamente a cada 15 segundos</p>
                  <button onClick={onRefresh} className="ml-auto text-[11px] text-orange-400 font-bold">Atualizar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {order?.items?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Resumo do Pedido</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">
                    <span className="font-semibold text-gray-900">{item.weight_kg ? `${item.weight_kg}kg` : `${item.quantity}×`}</span>{' '}{item.product_name}
                  </span>
                  <span className="font-bold text-gray-900 shrink-0 ml-2">{fmtBRL(item.total ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between font-black text-base">
              <span className="text-gray-700">Total</span>
              <span className="text-orange-600">{fmtBRL(order.total ?? 0)}</span>
            </div>
          </div>
        )}

        {isDelivery && order?.customer_address && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex gap-3">
            <span className="text-xl shrink-0">📍</span>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Endereço de Entrega</p>
              <p className="text-sm text-gray-700">{order.customer_address}</p>
            </div>
          </div>
        )}

        {/* Cashback ganho */}
        {delivered && parseFloat(order?.cashback_earned ?? 0) > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-4 py-4 flex gap-3 items-start">
            <span className="text-2xl shrink-0">💰</span>
            <div>
              <p className="text-sm font-black text-green-800">Você ganhou {fmtBRL(order.cashback_earned)} de cashback!</p>
              <p className="text-xs text-green-600 mt-0.5">Use no seu próximo pedido como desconto.</p>
            </div>
          </div>
        )}

        <div className="space-y-3 pt-1">
          {delivered && !order?.has_rating && (
            <button onClick={() => setShowRating(true)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-black text-sm transition-colors active:scale-95">
              ⭐ Avaliar Pedido
            </button>
          )}
          {delivered && order?.has_rating && (
            <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm font-semibold">
              ⭐ Pedido avaliado — obrigado!
            </div>
          )}
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre o Pedido #${order?.order_number ?? order?.orderNumber ?? ''}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold text-sm transition-colors shadow-lg shadow-green-200 active:scale-95">
              <IconWhatsApp />Falar com o restaurante
            </a>
          )}
          {/* Voltar ao cardápio sem perder o pedido */}
          <button onClick={onBackToMenu}
            className="w-full py-3.5 rounded-2xl border-2 border-orange-400 text-orange-600 font-bold text-sm hover:bg-orange-50 transition-colors active:scale-95 flex items-center justify-center gap-2">
            🍽️ Ver cardápio
          </button>
          {(delivered || cancelled) && (
            <button onClick={onNewOrder}
              className="w-full py-3 rounded-2xl bg-gray-100 text-gray-500 font-semibold text-sm hover:bg-gray-200 transition-colors active:scale-95">
              Fazer novo pedido
            </button>
          )}
        </div>
      </div>

      {showRating && (
        <RatingModal
          slug={slug}
          orderId={order?.id}
          orderNumber={order?.order_number ?? order?.orderNumber}
          cashbackEarned={parseFloat(order?.cashback_earned ?? 0)}
          onClose={() => setShowRating(false)}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function CustomerApp({ slug }) {
  // Detecta modo mesa via URL param ?mesa=X
  const tableParam = new URLSearchParams(window.location.search).get('mesa');

  const [menuData,    setMenuData]    = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError,   setMenuError]   = useState(null);
  const [splashDone,  setSplashDone]  = useState(false);

  const [cart,           setCart]           = useState(emptyCart());
  const [cartOpen,       setCartOpen]       = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [featured,       setFeatured]       = useState([]);

  const [page,  setPage]  = useState('menu');
  const [order, setOrder] = useState(null);

  // Addon picker
  const [pickerProduct, setPickerProduct] = useState(null);
  const [pickerGroups,  setPickerGroups]  = useState([]);

  // Perfil (localStorage)
  const [profile,      setProfile]      = useState(() => loadProfile(slug));
  const [showProfile,  setShowProfile]  = useState(false);

  // Checkout form
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [deliveryType,    setDeliveryType]    = useState(tableParam ? 'local' : 'pickup');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes,           setNotes]           = useState('');
  const [paymentMethod,   setPaymentMethod]   = useState('cash');
  const [trocoValue,      setTrocoValue]      = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [checkoutError,   setCheckoutError]   = useState(null);

  // CEP Autocomplete
  const [cep,             setCep]             = useState('');
  const [cepStreet,       setCepStreet]       = useState('');
  const [cepNeighborhood, setCepNeighborhood] = useState('');
  const [cepCity,         setCepCity]         = useState('');
  const [addressNumber,   setAddressNumber]   = useState('');
  const [addressComplement, setAddressComplement] = useState('');
  const [cepLoading,      setCepLoading]      = useState(false);
  const [cepFound,        setCepFound]        = useState(false);
  const cepRef = useRef(null);

  // GPS auto-location
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError,   setGpsError]   = useState(null);

  // Map picker
  const [showMap,          setShowMap]          = useState(false);
  const [deliveryLat,      setDeliveryLat]      = useState(null);
  const [deliveryLng,      setDeliveryLng]      = useState(null);
  const [deliveryFeeMap,   setDeliveryFeeMap]   = useState(null); // null = use tenant default
  const [deliveryEtaMap,   setDeliveryEtaMap]   = useState(null);
  const [outsideZone,      setOutsideZone]      = useState(false);
  const [mapConfirmed,     setMapConfirmed]     = useState(false); // address set via map

  // Fidelidade / cashback
  const [loyaltyData,    setLoyaltyData]    = useState(null);
  const [loyaltyMeta,    setLoyaltyMeta]    = useState(null);
  const [useCashback,    setUseCashback]    = useState(false);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const phoneDebounceRef = useRef(null);

  // Search
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  // ── Busca saldo de cashback ao digitar telefone ───────────

  const fetchLoyalty = useCallback((phone) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setLoyaltyData(null); setLoyaltyMeta(null); return; }
    clearTimeout(phoneDebounceRef.current);
    phoneDebounceRef.current = setTimeout(async () => {
      if (!menuData?.tenant?.cashback_enabled) return;
      setLoyaltyLoading(true);
      try {
        const { data } = await getPublicCustomer(slug, digits);
        setLoyaltyData(data.data ?? null);
        setLoyaltyMeta(data.meta ?? null);
      } catch {
        setLoyaltyData(null);
      } finally {
        setLoyaltyLoading(false);
      }
    }, 600);
  }, [slug, menuData?.tenant?.cashback_enabled]);

  const handlePhoneChange = (val) => {
    setCustomerPhone(val);
    setUseCashback(false);
    fetchLoyalty(val);
  };

  // ── CEP Autocomplete ──────────────────────────────────────
  const handleCepChange = async (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    // Format as 00000-000
    const formatted = digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits;
    setCep(formatted);
    setCepFound(false);
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await res.json();
      if (d.erro) { setCepLoading(false); return; }
      setCepStreet(d.logradouro || '');
      setCepNeighborhood(d.bairro || '');
      setCepCity(`${d.localidade}/${d.uf}`);
      setCepFound(true);
      // Build full address for submission
      const full = [d.logradouro, d.bairro, `${d.localidade}/${d.uf}`, `CEP: ${formatted}`].filter(Boolean).join(', ');
      setCustomerAddress(full);
      // Focus number field
      setTimeout(() => cepRef.current?.focus(), 80);
    } catch { /* viacep offline — user can type manually */ }
    finally { setCepLoading(false); }
  };

  const buildFullAddress = (number, complement) => {
    const parts = [
      cepStreet && `${cepStreet}${number ? `, ${number}` : ''}`,
      complement,
      cepNeighborhood,
      cepCity,
      cep && `CEP: ${cep}`,
    ].filter(Boolean);
    return parts.join(', ');
  };

  // ── GPS Auto-location ─────────────────────────────────────

  const handleGpsLocate = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS não suportado neste dispositivo.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          // Nominatim (OpenStreetMap) — free, no API key, works in Brazil
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR' } }
          );
          const d = await res.json();
          const a = d.address ?? {};
          const street      = [a.road ?? a.street ?? '', a.house_number ?? ''].filter(Boolean).join(', ');
          const neighborhood = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.district ?? '';
          const city         = `${a.city ?? a.town ?? a.municipality ?? a.county ?? ''}${a.state ? `/${a.state}` : ''}`;
          const postcode     = a.postcode ?? '';

          setCepStreet(street);
          setCepNeighborhood(neighborhood);
          setCepCity(city);
          if (postcode) setCep(postcode.replace('-', '').slice(0, 5) + (postcode.replace('-', '').slice(5, 8) ? `-${postcode.replace('-', '').slice(5, 8)}` : ''));
          setCepFound(true);

          const full = [street, neighborhood, city, postcode && `CEP: ${postcode}`].filter(Boolean).join(', ');
          setCustomerAddress(full);
          // Focus number field
          setTimeout(() => cepRef.current?.focus(), 80);
        } catch {
          setGpsError('Não foi possível identificar seu endereço. Digite manualmente.');
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) setGpsError('Permissão de localização negada. Digite seu CEP.');
        else setGpsError('Localização indisponível. Use o CEP.');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // ── Map picker confirm ────────────────────────────────────
  const handleMapConfirm = ({ lat, lng, address, neighborhood, city, cep: mapCep, fee, eta, outsideZone: oz }) => {
    setDeliveryLat(lat);
    setDeliveryLng(lng);
    setDeliveryFeeMap(fee);
    setDeliveryEtaMap(eta);
    setOutsideZone(oz);
    setCustomerAddress(address);
    setCepStreet('');
    setCepNeighborhood(neighborhood);
    setCepCity(city);
    if (mapCep) setCep(mapCep);
    setCepFound(true);
    setMapConfirmed(true);
    setShowMap(false);
  };

  // ── Load menu ─────────────────────────────────────────────

  useEffect(() => {
    setLoadingMenu(true);
    getPublicMenu(slug)
      .then(({ data }) => {
        const d = data.data ?? data;
        setMenuData(d);
        if (d.categories?.length > 0) setActiveCategory(d.categories[0].name);
        if (d.featured) setFeatured(d.featured);
        // Restaurar pedido ativo
        const saved = loadOrder(slug);
        if (saved) {
          trackPublicOrder(saved.id)
            .then(({ data: od }) => {
              const o = od.data ?? od;
              if (['pending','confirmed','preparing','ready'].includes(o.status)) {
                setOrder(o); setPage('tracking');
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => setMenuError('Não foi possível carregar o cardápio. Tente novamente.'))
      .finally(() => setLoadingMenu(false));
  }, [slug]);

  // Pré-preenche formulário com perfil salvo
  useEffect(() => {
    if (profile?.name)  setCustomerName(profile.name);
    if (profile?.phone) { setCustomerPhone(profile.phone); fetchLoyalty(profile.phone); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name, profile?.phone]);

  // ── Tracking poll ─────────────────────────────────────────

  const refreshOrder = useCallback(() => {
    if (!order?.id) return;
    trackPublicOrder(order.id)
      .then(({ data }) => setOrder(data.data ?? data))
      .catch(() => {});
  }, [order?.id]);

  useEffect(() => {
    if (page !== 'tracking' || !order?.id) return;
    const interval = setInterval(refreshOrder, 15_000);
    return () => clearInterval(interval);
  }, [page, order?.id, refreshOrder]);

  // ── Add to cart ───────────────────────────────────────────

  const handleAdd = useCallback((product) => {
    const groups = product.addon_groups ?? [];
    if (groups.length > 0) { setPickerProduct(product); setPickerGroups(groups); }
    else setCart(c => addToCart(c, product));
  }, []);

  const handlePickerConfirm = useCallback((addons) => {
    setCart(c => addToCart(c, pickerProduct, addons));
    setPickerProduct(null); setPickerGroups([]);
  }, [pickerProduct]);

  const handlePickerClose = useCallback(() => { setPickerProduct(null); setPickerGroups([]); }, []);

  // ── Cart helpers ──────────────────────────────────────────

  const setWeight = useCallback((id, w) => setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } })), []);
  const setQty    = useCallback((id, qty) => setCart((c) => ({ ...c, [id]: { ...c[id], qty: Math.max(1, parseInt(qty) || 1) } })), []);

  const cartEntries = Object.values(cart);
  const total       = cartTotal(cart);
  const count       = cartCount(cart);

  // ── Submit order ──────────────────────────────────────────

  const handleSubmit = async () => {
    if (!customerName.trim()) return setCheckoutError('Informe seu nome.');
    if (deliveryType === 'delivery' && !customerAddress.trim())
      return setCheckoutError('Informe o endereço de entrega.');
    // D1: bloqueia submit sem taxa calculada (endereço digitado manualmente sem confirmar mapa)
    if (deliveryType === 'delivery' && deliveryFeeMap === null)
      return setCheckoutError('Confirme o endereço no mapa para calcular a taxa de entrega.');
    if (cartEntries.length === 0) return setCheckoutError('Carrinho vazio.');

    // Valida peso para produtos por kg
    const missingWeight = cartEntries.find(({ product, weightKg }) =>
      product.sale_type === 'kg' && (!weightKg || parseFloat(weightKg) <= 0)
    );
    if (missingWeight) return setCheckoutError(`Informe o peso de "${missingWeight.product.name}".`);

    setCheckoutError(null);
    setSubmitting(true);

    const items = cartEntries.map(({ product, qty, weightKg, addons = [] }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg' ? { weightKg: parseFloat(weightKg) } : { quantity: qty }),
      ...(addons.length > 0 ? { addons } : {}),
    }));

    let finalNotes = notes.trim();
    if (paymentMethod === 'cash' && trocoValue.trim()) {
      const extra = `Troco para: R$ ${trocoValue.trim()}`;
      finalNotes = finalNotes ? `${finalNotes} | ${extra}` : extra;
    }

    try {
      const { data } = await createPublicOrder(slug, {
        customerName:    customerName.trim(),
        customerPhone:   customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        deliveryType,
        paymentMethod,
        notes: finalNotes || undefined,
        items,
        // D1: envia deliveryFee ao backend para que seja gravada corretamente
        deliveryFee: deliveryType === 'delivery' ? (deliveryFeeMap ?? 0) : 0,
        useCashback: useCashback && !!loyaltyData,
        tableNumber: tableParam || undefined,
        deliveryLat:  deliveryLat  || undefined,
        deliveryLng:  deliveryLng  || undefined,
      });
      const created = data.data ?? data;
      saveOrder(slug, created);
      // Salva perfil automaticamente se não tinha
      if (!profile && customerName.trim() && customerPhone.trim()) {
        const p = { name: customerName.trim(), phone: customerPhone.trim() };
        saveProfile(slug, p);
        setProfile(p);
      }
      setOrder(created);
      setCart(emptyCart());
      setLoyaltyData(null);
      setUseCashback(false);
      setPage('tracking');
    } catch (err) {
      setCheckoutError(err.response?.data?.message ?? 'Erro ao criar pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Search filter ─────────────────────────────────────────

  const searchLower       = search.toLowerCase().trim();
  const filteredCategories = (menuData?.categories ?? []).map((cat) => ({
    ...cat,
    items: cat.items.filter((p) =>
      !searchLower || (p.display_name ?? p.name).toLowerCase().includes(searchLower) || (p.description ?? '').toLowerCase().includes(searchLower)
    ),
  })).filter((cat) => cat.items.length > 0);

  // ── Render: loading / error ───────────────────────────────

  if (loadingMenu && splashDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm font-medium">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (menuError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">😕</div>
          <p className="text-red-500 font-semibold">{menuError}</p>
          <button onClick={() => window.location.reload()} className="bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-md">Tentar novamente</button>
        </div>
      </div>
    );
  }

  const tenant     = menuData?.tenant ?? {};
  const categories = menuData?.categories ?? [];

  // ── PAGE: TRACKING ────────────────────────────────────────

  if (page === 'tracking') {
    return (
      <TrackingPage
        order={order}
        tenant={tenant}
        slug={slug}
        onBackToMenu={() => setPage('menu')}
        onNewOrder={() => { setPage('menu'); setOrder(null); }}
        onRefresh={refreshOrder}
      />
    );
  }

  // ── Map picker overlay (renders above checkout/menu) ─────
  if (showMap) {
    const t = menuData?.tenant ?? {};
    return (
      <DeliveryMapPicker
        initialLat={deliveryLat || t.restaurant_lat || -15.7942}
        initialLng={deliveryLng || t.restaurant_lng || -47.8822}
        deliveryZones={t.delivery_zones ?? []}
        deliveryZoneType={t.delivery_zone_type ?? 'named'}
        restaurantLat={t.restaurant_lat}
        restaurantLng={t.restaurant_lng}
        onConfirm={handleMapConfirm}
        onClose={() => setShowMap(false)}
      />
    );
  }

  // ── PAGE: CHECKOUT ────────────────────────────────────────

  if (page === 'checkout') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-4 text-white shadow-lg sticky top-0 z-10">
          <button onClick={() => setPage('menu')} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-1">
            <IconBack /><span className="text-sm font-medium">Voltar ao cardápio</span>
          </button>
          <h1 className="text-xl font-black">Finalizar Pedido</h1>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4 pb-10">
          {/* Order summary */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">Seu pedido</p>
            </div>
            <div className="px-4 py-3 space-y-3">
              {cartEntries.map(({ product: p, qty, weightKg, addons = [] }) => {
                const lineBase   = p.sale_type === 'kg' ? parseFloat(p.sale_price) * parseFloat(weightKg || 0) : parseFloat(p.sale_price) * qty;
                const lineExtras = addonLinePrice(addons) * (p.sale_type === 'kg' ? 1 : qty);
                return (
                  <div key={p.id} className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.display_name ?? p.name}</p>
                      <p className="text-xs text-gray-400">
                        {p.sale_type === 'kg' ? `${parseFloat(weightKg || 0).toFixed(2)} kg × ${fmtBRL(p.sale_price)}/kg` : `${qty} × ${fmtBRL(p.sale_price)}`}
                      </p>
                      {addons.length > 0 && <p className="text-xs text-orange-500 mt-0.5">+ {addons.map(a => `${a.addon_name}${a.qty > 1 ? ` ×${a.qty}` : ''}`).join(', ')}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-orange-600">{fmtBRL(lineBase + lineExtras)}</span>
                      <div className="flex items-center gap-1">
                        {p.sale_type !== 'kg' && (
                          <>
                            <button onClick={() => { if (qty <= 1) setCart((c) => removeFromCart(c, p.id)); else setQty(p.id, qty - 1); }}
                              className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold flex items-center justify-center hover:bg-gray-200">−</button>
                            <span className="w-6 text-center text-sm font-bold text-gray-800">{qty}</span>
                            <button onClick={() => setQty(p.id, qty + 1)}
                              className="w-7 h-7 rounded-lg bg-orange-500 text-white font-bold flex items-center justify-center hover:bg-orange-600">+</button>
                          </>
                        )}
                        <button onClick={() => setCart((c) => removeFromCart(c, p.id))}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 font-bold flex items-center justify-center hover:bg-red-100 ml-1">×</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between font-black text-base">
              <span className="text-gray-700">Total</span>
              <span className="text-orange-600">{fmtBRL(total)}</span>
            </div>
          </div>

          {/* Customer form */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Seus dados</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <input type="text" placeholder="Seu nome completo *"
                value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                autoComplete="name" />

              <div className="relative">
                <input type="tel" placeholder="WhatsApp / Telefone (para cashback e fidelidade)"
                  value={customerPhone} onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  autoComplete="tel" />
                {loyaltyLoading && <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />}
              </div>

              {/* CTA para se cadastrar (sem perfil e cashback ativo) */}
              {!profile && tenant?.cashback_enabled && !loyaltyData && customerPhone.replace(/\D/g,'').length < 10 && (
                <button onClick={() => setShowProfile(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-left hover:bg-orange-100 transition-colors">
                  <span className="text-xl">💰</span>
                  <div>
                    <p className="text-sm font-bold text-orange-700">Faça o cadastro e ganhe cashback!</p>
                    <p className="text-xs text-orange-500">Acumule crédito em cada pedido</p>
                  </div>
                  <span className="ml-auto text-orange-400 font-bold text-lg">→</span>
                </button>
              )}

              {/* Banner de cashback disponível */}
              {loyaltyData && parseFloat(loyaltyData.cashback_balance) > 0 && (
                <div className={`rounded-2xl border-2 p-4 transition-all ${useCashback ? 'border-green-400 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">💰</span>
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-800">Você tem {fmtBRL(loyaltyData.cashback_balance)} de cashback!</p>
                      <p className="text-xs text-gray-500 mt-0.5">{loyaltyData.total_orders} {loyaltyData.total_orders === 1 ? 'pedido' : 'pedidos'} realizados</p>
                      <button onClick={() => setUseCashback(v => !v)}
                        className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${useCashback ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                        {useCashback ? '✓ Cashback aplicado!' : 'Usar cashback neste pedido'}
                      </button>
                    </div>
                  </div>
                  {useCashback && <p className="text-xs text-green-600 font-semibold mt-2 pl-9">Desconto de {fmtBRL(loyaltyData.cashback_balance)} será aplicado.</p>}
                </div>
              )}

              {/* Cashback a ganhar */}
              {loyaltyMeta && tenant?.cashback_enabled && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-base">🎁</span>
                  <p className="text-xs text-gray-500">
                    Ganhe <span className="font-bold text-orange-500">{loyaltyMeta.cashback_rate}% de cashback</span> neste pedido
                    {loyaltyMeta.cashback_min_order > 0 && ` (acima de ${fmtBRL(loyaltyMeta.cashback_min_order)})`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Delivery type — oculto em modo mesa */}
          {tableParam ? (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🪑</span>
              <div>
                <p className="text-sm font-black text-orange-700">Mesa {tableParam}</p>
                <p className="text-xs text-orange-500">Consumo no local — sem entrega</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Como quer receber?</p>
              </div>
              <div className="px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[{ v: 'pickup', icon: '🏪', label: 'Retirar no Local' }, { v: 'delivery', icon: '🛵', label: 'Receber em Casa' }].map(({ v, icon, label }) => (
                    <button key={v} onClick={() => setDeliveryType(v)}
                      className={`flex flex-col items-center gap-1.5 py-4 rounded-xl font-bold text-sm border-2 transition-all ${deliveryType === v ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      <span className="text-2xl">{icon}</span>{label}
                    </button>
                  ))}
                </div>
                {deliveryType === 'delivery' && (
                  <div className="space-y-2">

                    {/* ── Confirmed via map ── */}
                    {mapConfirmed ? (
                      <div className="space-y-2">
                        <div className={`rounded-2xl px-4 py-3 border ${outsideZone ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                          <div className="flex items-start gap-2">
                            <span className="text-lg mt-0.5">📍</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${outsideZone ? 'text-red-500' : 'text-green-600'}`}>
                                {outsideZone ? 'Fora da área de entrega' : 'Endereço confirmado no mapa'}
                              </p>
                              <p className="text-sm font-semibold text-gray-800 leading-snug">{customerAddress}</p>
                              {deliveryFeeMap !== null && !outsideZone && (
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs font-bold text-orange-600">
                                    {deliveryFeeMap === 0 ? '🚀 Frete grátis' : `🚗 Taxa: ${fmtBRL(deliveryFeeMap)}`}
                                  </span>
                                  {deliveryEtaMap && <span className="text-xs text-gray-500">⏱️ {deliveryEtaMap}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setMapConfirmed(false); setShowMap(true); }}
                          className="w-full text-xs font-bold text-blue-600 py-1.5 hover:underline"
                        >
                          🗺️ Ajustar no mapa
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* PRIMARY: GPS + Map */}
                        <button
                          type="button"
                          onClick={() => setShowMap(true)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-orange-500 text-white font-black text-sm shadow-md shadow-orange-200 hover:bg-orange-600 active:scale-95 transition-all"
                        >
                          🗺️ Escolher no mapa
                        </button>

                        {/* SECONDARY: GPS quick-fill */}
                        <button
                          type="button"
                          onClick={handleGpsLocate}
                          disabled={gpsLoading}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-50 border-2 border-blue-200 text-blue-700 font-bold text-sm hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-60"
                        >
                          {gpsLoading
                            ? <><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> Localizando…</>
                            : <>📍 Usar minha localização</>}
                        </button>
                        {gpsError && <p className="text-xs text-red-500 px-1">{gpsError}</p>}

                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs text-gray-400 font-medium">ou pelo CEP</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>

                        {/* FALLBACK: CEP */}
                        <div className="relative">
                          <input
                            type="text" inputMode="numeric" placeholder="CEP (00000-000)"
                            value={cep} onChange={(e) => handleCepChange(e.target.value)}
                            maxLength={9}
                            className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 bg-white pr-10 ${cepFound ? 'border-green-400 focus:ring-green-300' : 'border-gray-200 focus:ring-blue-400'}`}
                          />
                          {cepLoading && <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
                          {cepFound && !cepLoading && <span className="absolute right-3 top-3 text-green-500 text-lg">✓</span>}
                        </div>

                        {cepFound ? (
                          <>
                            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                              <p className="text-xs font-semibold text-green-700">
                                {cepStreet && `${cepStreet}, `}{cepNeighborhood && `${cepNeighborhood}, `}{cepCity}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                ref={cepRef}
                                type="text" inputMode="numeric" placeholder="Número *"
                                value={addressNumber}
                                onChange={(e) => { setAddressNumber(e.target.value); setCustomerAddress(buildFullAddress(e.target.value, addressComplement)); }}
                                className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                              />
                              <input
                                type="text" placeholder="Complemento"
                                value={addressComplement}
                                onChange={(e) => { setAddressComplement(e.target.value); setCustomerAddress(buildFullAddress(addressNumber, e.target.value)); }}
                                className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                              />
                            </div>
                          </>
                        ) : (
                          <input type="text" placeholder="Ou digite o endereço completo"
                            value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment method */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Forma de pagamento</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash',    emoji: '💵', name: 'Dinheiro' },
                  { value: 'pix',     emoji: '📱', name: 'Pix' },
                  { value: 'credit',  emoji: '💳', name: 'Crédito' },
                  { value: 'debit',   emoji: '💳', name: 'Débito' },
                  { value: 'voucher', emoji: '🎫', name: 'Vale Ref.' },
                  { value: 'other',   emoji: '🔖', name: 'Outro' },
                ].map(({ value, emoji, name }) => (
                  <button key={value} onClick={() => setPaymentMethod(value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${paymentMethod === value ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    <span className="text-xl">{emoji}</span>
                    <span className="text-xs">{name}</span>
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <input type="text" placeholder="Troco para quanto? (ex: 50,00)"
                  value={trocoValue} onChange={(e) => setTrocoValue(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
            <textarea placeholder="Alguma observação? (ex: sem cebola, ponto da carne...)"
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
          </div>

          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">⚠️ {checkoutError}</div>
          )}

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-green-200 text-base flex items-center justify-center gap-2 active:scale-95">
            {submitting ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</> : `Confirmar Pedido · ${fmtBRL(total)}`}
          </button>
        </div>
      </div>
    );
  }

  // ── PAGE: MENU ────────────────────────────────────────────

  const CATEGORY_GRADIENTS = ['from-orange-400 to-red-500','from-purple-500 to-pink-500','from-green-400 to-teal-500','from-blue-400 to-indigo-500','from-yellow-400 to-orange-500','from-pink-400 to-rose-500'];
  const getCategoryGradient = (name) => { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return CATEGORY_GRADIENTS[Math.abs(h) % CATEGORY_GRADIENTS.length]; };
  const getProductEmoji = (name) => {
    const n = name.toLowerCase();
    if (n.includes('burger')||n.includes('x-')||n.includes('hamb')||n.includes('smash')) return '🍔';
    if (n.includes('pizza')) return '🍕';
    if (n.includes('frango')) return '🍗';
    if (n.includes('hotdog')||n.includes('hot dog')||n.includes('cachorro')) return '🌭';
    if (n.includes('batata')||n.includes('fritas')) return '🍟';
    if (n.includes('salada')) return '🥗';
    if (n.includes('suco')||n.includes('vitamina')) return '🥤';
    if (n.includes('coca')||n.includes('refri')||n.includes('bebida')||n.includes('água')||n.includes('guarana')) return '🥤';
    if (n.includes('milk')||n.includes('shake')) return '🥛';
    if (n.includes('sorvete')||n.includes('açaí')||n.includes('acai')) return '🍨';
    if (n.includes('bolo')||n.includes('torta')||n.includes('brownie')) return '🎂';
    if (n.includes('chocolate')) return '🍫';
    if (n.includes('café')||n.includes('capuccino')) return '☕';
    if (n.includes('cerveja')||n.includes('chopp')) return '🍺';
    return '🍽️';
  };

  const activeCat   = categories.find((c) => c.name === activeCategory);
  const displayCats = search ? filteredCategories : (activeCat ? [activeCat] : categories);

  // Status de pedido ativo (não finalizado/cancelado)
  const activeOrderStatuses = ['pending','confirmed','preparing','ready','delivering'];
  const hasActiveOrder = order && activeOrderStatuses.includes(order.status);
  const STATUS_LABEL_SHORT = { pending: 'Aguardando confirmação', confirmed: 'Confirmado', preparing: 'Em preparo 👨‍🍳', ready: 'Pronto! ✅', delivering: 'Saiu para entrega 🛵' };

  const restaurantName = menuData?.tenant?.name ?? 'Restaurante';

  return (
    <div className="min-h-screen bg-zinc-950">

      {/* ── Splash de entrada ── */}
      {!splashDone && (
        <SplashScreen
          restaurantName={restaurantName}
          onDone={() => setSplashDone(true)}
        />
      )}

      {/* Banner de pedido ativo — sticky no topo */}
      {hasActiveOrder && (
        <div
          className="sticky top-0 z-30 bg-orange-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg cursor-pointer active:bg-orange-600"
          onClick={() => setPage('tracking')}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-black leading-none">Pedido #{order.order_number ?? order.orderNumber}</p>
              <p className="text-[11px] opacity-80 mt-0.5 truncate">{STATUS_LABEL_SHORT[order.status] ?? order.status}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 bg-white/20 rounded-xl px-3 py-1.5">
            <span className="text-xs font-black">Ver status</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      )}

      {/* Hero header */}
      <div className="relative overflow-hidden" style={{ minHeight: 220 }}>
        {tenant.cover_url
          ? <img src={tenant.cover_url} alt={tenant.name} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
        }
        {/* Premium dark vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-black/50 to-black/20" />

        <div className="relative px-4 pt-8 pb-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-3xl mb-3 shadow-lg border border-white/20">🍽️</div>
              <h1 className="text-2xl font-black leading-tight drop-shadow">{tenant.name ?? 'Restaurante'}</h1>
              {tenant.description && <p className="text-white/80 text-xs mt-1 leading-relaxed max-w-xs">{tenant.description}</p>}
              {tenant.address && <p className="text-white/70 text-xs mt-1 flex items-center gap-1"><span>📍</span>{tenant.address}</p>}
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              {/* Badge mesa */}
              {tableParam && (
                <div className="flex items-center gap-1.5 bg-orange-500 border border-orange-400/50 rounded-2xl px-3 py-2">
                  <span className="text-base leading-none">🪑</span>
                  <span className="text-xs font-black leading-none">Mesa {tableParam}</span>
                </div>
              )}
              {/* Ícone de perfil */}
              <button onClick={() => setShowProfile(true)}
                className={`flex items-center gap-1.5 backdrop-blur border rounded-2xl px-3 py-2 hover:bg-white/30 transition-colors ${profile ? 'bg-white/20 border-white/30' : 'bg-orange-600/80 border-orange-400/50'}`}>
                <IconUser />
                <span className="text-xs font-bold leading-none">
                  {profile ? profile.name.split(' ')[0] : 'Perfil'}
                </span>
                {profile && (
                  <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
              </button>

            </div>
          </div>

          {/* Chips: status + whatsapp + cashback */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="flex items-center gap-1 bg-white/20 backdrop-blur rounded-full px-2.5 py-1 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Aberto agora
            </span>
            {tenant.whatsapp_number && (
              <a href={`https://wa.me/${tenant.whatsapp_number.replace(/\D/g,'')}?text=${encodeURIComponent('Olá, vi o cardápio e gostaria de saber mais!')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 bg-green-500/80 backdrop-blur rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-green-500 transition-colors">
                <IconWhatsApp />WhatsApp
              </a>
            )}
            {tenant.cashback_enabled && (
              <span className="flex items-center gap-1 bg-yellow-400/90 text-yellow-900 backdrop-blur rounded-full px-2.5 py-1 text-xs font-bold">
                💰 Cashback {tenant.cashback_rate}%
              </span>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative px-4 pb-4">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input ref={searchRef} type="search" placeholder="Buscar no cardápio..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900/90 backdrop-blur border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 shadow-lg" />
          </div>
        </div>
      </div>

      {/* Category tabs — dark premium */}
      {!search && categories.length > 1 && (
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-white/[0.06]">
          <div className="flex gap-1.5 overflow-x-auto px-3 py-3 scrollbar-none">
            {categories.map((cat) => (
              <button key={cat.name} onClick={() => setActiveCategory(cat.name)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  activeCategory === cat.name
                    ? 'bg-amber-400 text-zinc-900 shadow-sm shadow-amber-400/20'
                    : 'bg-white/[0.07] text-zinc-400 hover:text-white hover:bg-white/10'
                }`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Destaques */}
      {featured.length > 0 && !search && (
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-sm font-black text-amber-400 uppercase tracking-wider mb-3">⭐ Destaques</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
            {featured.map(product => {
              const inCart = cart[product.id];
              const grad   = getCategoryGradient(product.category_name ?? product.name);
              return (
                <div key={product.id}
                  className="shrink-0 w-40 bg-zinc-900 rounded-2xl overflow-hidden border border-white/[0.08] flex flex-col cursor-pointer active:scale-95 transition-transform hover:border-amber-400/30"
                  onClick={() => !inCart && handleAdd(product)}>
                  <div className={`h-28 relative ${!product.image_url ? `bg-gradient-to-br ${grad}` : ''}`}>
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-5xl">{getProductEmoji(product.name)}</div>
                    }
                    {inCart && <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow">{inCart.qty}</div>}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <p className="text-xs font-bold text-zinc-100 leading-tight line-clamp-2">{product.display_name ?? product.name}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-amber-400 font-black text-sm">{fmtBRL(product.sale_price)}</span>
                      {!inCart ? <span className="text-amber-400 text-lg font-black">+</span> : <span className="text-green-400 text-xs font-bold">✓</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-32">
        {search && filteredCategories.length === 0 && (
          <div className="text-center py-16 text-zinc-500"><div className="text-5xl mb-3">🔍</div><p className="font-semibold text-zinc-300">Nenhum produto encontrado</p><p className="text-sm mt-1">Tente buscar por outro nome</p></div>
        )}
        {!search && categories.length === 0 && (
          <div className="text-center py-20 text-zinc-500"><div className="text-5xl mb-3">🍽️</div><p className="font-semibold text-zinc-300">Cardápio em breve!</p></div>
        )}

        {displayCats.map((cat) => (
          <div key={cat.name} className="mb-8">
            {/* Category divider — premium style */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xs font-black text-amber-400/80 uppercase tracking-widest">{cat.name}</h2>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="space-y-3">
              {(cat.items ?? []).map((product) => {
                const inCart     = cart[product.id];
                const outOfStock = product.stock_qty <= 0;
                const hasAddons  = (product.addon_groups ?? []).length > 0;
                return (
                  <div key={product.id}
                    className={`rounded-2xl border overflow-hidden transition-all ${
                      outOfStock ? 'opacity-40' : ''
                    } ${
                      inCart
                        ? 'bg-zinc-800/80 border-amber-400/30 ring-1 ring-amber-400/20'
                        : 'bg-zinc-900 border-white/[0.07] hover:border-white/[0.14]'
                    }`}>
                    <div className="flex gap-3 p-3.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1 flex-wrap mb-1">
                          {product.featured && <span className="text-[10px] bg-amber-400/20 text-amber-300 font-bold px-1.5 py-0.5 rounded-full">⭐ Destaque</span>}
                          {outOfStock && <span className="text-[10px] bg-red-500/15 text-red-400 font-bold px-2 py-0.5 rounded-full">Esgotado</span>}
                          {hasAddons && <span className="text-[10px] bg-orange-500/15 text-orange-300 font-bold px-1.5 py-0.5 rounded-full">🍟 Personalizável</span>}
                        </div>
                        <p className="font-bold text-zinc-100 text-sm leading-tight">{product.display_name ?? product.name}</p>
                        {product.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{product.description}</p>}
                        {inCart?.addons?.length > 0 && (
                          <p className="text-xs text-amber-400/80 mt-1">+ {inCart.addons.map(a => `${a.addon_name}${a.qty > 1 ? ` ×${a.qty}` : ''}`).join(', ')}</p>
                        )}
                        <div className="flex items-center justify-between mt-2.5 gap-2">
                          <span className="text-amber-400 font-black text-base tabular-nums">
                            {fmtBRL(product.sale_price)}{product.sale_type === 'kg' && <span className="text-xs font-semibold text-zinc-500">/kg</span>}
                          </span>
                          {!outOfStock && (
                            product.sale_type === 'kg' ? (
                              <input type="number" min="0.1" step="0.1" placeholder="0.0 kg"
                                value={inCart?.weightKg ?? ''}
                                onChange={(e) => { if (!inCart) setCart((c) => addToCart(c, product)); setWeight(product.id, e.target.value); }}
                                onFocus={() => { if (!inCart) setCart((c) => addToCart(c, product)); }}
                                className="w-24 bg-zinc-800 border border-white/10 rounded-xl px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            ) : inCart ? (
                              <div className="flex items-center gap-2">
                                {hasAddons && (
                                  <button onClick={() => handleAdd(product)} className="text-[10px] font-bold text-amber-400 hover:text-amber-300 border border-amber-400/30 px-1.5 py-1 rounded-lg transition-colors">editar</button>
                                )}
                                <button onClick={() => { if (inCart.qty <= 1) setCart((c) => removeFromCart(c, product.id)); else setQty(product.id, inCart.qty - 1); }}
                                  className="w-8 h-8 rounded-xl bg-zinc-700 text-white font-black text-lg flex items-center justify-center hover:bg-zinc-600">−</button>
                                <span className="w-6 text-center font-black text-white text-sm tabular-nums">{inCart.qty}</span>
                                <button onClick={() => setQty(product.id, inCart.qty + 1)}
                                  className="w-8 h-8 rounded-xl bg-amber-400 text-zinc-900 font-black text-lg flex items-center justify-center hover:bg-amber-300">+</button>
                              </div>
                            ) : (
                              <button onClick={() => handleAdd(product)}
                                className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-900 font-black text-sm px-3.5 py-2 rounded-xl transition-colors active:scale-95">
                                <span className="text-base leading-none">+</span>Adicionar
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      <div className="w-24 h-24 rounded-xl overflow-hidden bg-zinc-800 shrink-0 self-start">
                        {product.image_url
                          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                          : <div className={`w-full h-full bg-gradient-to-br ${getCategoryGradient(product.category_name ?? product.name)} flex items-center justify-center text-4xl`}>{getProductEmoji(product.name)}</div>
                        }
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky cart bar */}
      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 pointer-events-none">
          <button onClick={() => setCartOpen(true)}
            className="pointer-events-auto w-full max-w-lg mx-auto flex items-center justify-between bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-4 rounded-2xl shadow-2xl shadow-orange-300/50 transition-colors active:scale-95">
            <span className="bg-white/25 rounded-full w-7 h-7 flex items-center justify-center font-black text-sm">{count}</span>
            <span className="flex items-center gap-2"><IconCart />Ver Carrinho</span>
            <span className="font-black">{fmtBRL(total)}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
            style={{ animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-black text-gray-900 text-lg">Seu Carrinho</h3>
                <p className="text-xs text-gray-400">{count} {count === 1 ? 'item' : 'itens'} · {fmtBRL(total)}</p>
              </div>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cartEntries.map(({ product: p, qty, weightKg, addons = [] }) => {
                const lineBase   = p.sale_type === 'kg' ? parseFloat(p.sale_price) * parseFloat(weightKg || 0) : parseFloat(p.sale_price) * qty;
                const lineExtras = addonLinePrice(addons) * (p.sale_type === 'kg' ? 1 : qty);
                return (
                  <div key={p.id} className="flex items-start gap-3 py-1">
                    {p.image_url && <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0"><img src={p.image_url} alt={p.display_name ?? p.name} className="w-full h-full object-cover" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.display_name ?? p.name}</p>
                      <p className="text-xs text-gray-400">
                        {p.sale_type === 'kg' ? `${parseFloat(weightKg || 0).toFixed(3)} kg × ${fmtBRL(p.sale_price)}/kg` : `${qty} × ${fmtBRL(p.sale_price)}`}
                      </p>
                      {addons.length > 0 && <p className="text-xs text-orange-500 mt-0.5">+ {addons.map(a => a.addon_name).join(', ')}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-orange-600">{fmtBRL(lineBase + lineExtras)}</p>
                      <button onClick={() => setCart(c => removeFromCart(c, p.id))} className="text-xs text-red-400 hover:text-red-600 font-bold mt-1">remover</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between font-black text-base">
                <span className="text-gray-700">Total</span>
                <span className="text-orange-600">{fmtBRL(total)}</span>
              </div>
              <button onClick={() => { setCartOpen(false); setPage('checkout'); }}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-green-200 text-base active:scale-95">
                Finalizar Pedido →
              </button>
            </div>
          </div>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Addon Picker */}
      {pickerProduct && (
        <AddonPicker
          product={pickerProduct}
          groups={pickerGroups}
          onConfirm={handlePickerConfirm}
          onClose={handlePickerClose}
        />
      )}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          slug={slug}
          profile={profile}
          cashbackEnabled={!!tenant?.cashback_enabled}
          onSave={(p) => setProfile(p)}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
