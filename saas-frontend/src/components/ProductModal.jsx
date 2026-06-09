/**
 * ProductModal — modal premium de detalhe de produto para o cardápio digital.
 * Abre deslizando de baixo para cima (mobile-first), com foto grande,
 * selos de confiança, seletor de quantidade e botão fixo de adicionar.
 *
 * Props:
 *   product     – objeto do produto (do menu público)
 *   cart        – estado atual do carrinho
 *   badgeConfig – menuData.badge_config (nomes personalizados de selos)
 *   onClose     – fecha sem adicionar
 *   onAdd       – (product, qty) => void — chamado ao confirmar adição
 */

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ── Helpers (autocontidos para não criar dependência circular) ─────────────

const fmtBRL = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2).replace('.', ',')}`;

const CATEGORY_GRADIENTS = [
  'from-orange-400 to-red-500',
  'from-purple-500 to-pink-500',
  'from-green-400 to-teal-500',
  'from-blue-400 to-indigo-500',
  'from-yellow-400 to-orange-500',
  'from-pink-400 to-rose-500',
];

const getCategoryGradient = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CATEGORY_GRADIENTS[Math.abs(h) % CATEGORY_GRADIENTS.length];
};

const getProductEmoji = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('burger') || n.includes('x-') || n.includes('hamb') || n.includes('smash')) return '🍔';
  if (n.includes('frango') || n.includes('chicken')) return '🍗';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('hot dog') || n.includes('cachorro')) return '🌭';
  if (n.includes('taco')) return '🌮';
  if (n.includes('salada') || n.includes('salad')) return '🥗';
  if (n.includes('batata') || n.includes('fries')) return '🍟';
  if (n.includes('sorvete') || n.includes('açaí') || n.includes('acai')) return '🍦';
  if (n.includes('suco') || n.includes('limonada') || n.includes('soda') || n.includes('refri')) return '🥤';
  if (n.includes('milk') || n.includes('shake')) return '🥛';
  if (n.includes('sushi') || n.includes('japon')) return '🍱';
  if (n.includes('sanduíche') || n.includes('sanduiche') || n.includes('wrap')) return '🥪';
  return '🍽️';
};

// ── Trust badges ───────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: '✅', label: 'Pagamento seguro' },
  { icon: '🛵', label: 'Entrega rápida'   },
  { icon: '🍔', label: 'Feito na hora'    },
  { icon: '🔒', label: 'Compra protegida' },
];

// ── Badge config ───────────────────────────────────────────────────────────

const BADGE_DEFAULTS = {
  mais_pedido: '🔥 Mais Pedido',
  escolha_rei: '👑 Escolha do Rei',
  novidade:    '⭐ Novidade',
  explosao:    '💣 Explosão de Sabor',
};

const BADGE_CLS = {
  mais_pedido: 'bg-orange-500 text-white',
  escolha_rei: 'bg-yellow-400 text-zinc-900',
  novidade:    'bg-blue-500 text-white',
  explosao:    'bg-red-600 text-white',
};

// ── Component ──────────────────────────────────────────────────────────────

export default function ProductModal({ product, cart, badgeConfig = {}, onClose, onAdd }) {
  const inCart    = cart[product.id];
  const [qty, setQty]   = useState(inCart?.qty ?? 1);
  const [added, setAdded] = useState(false);

  const price     = parseFloat(product.sale_price ?? 0);
  const isKg      = product.sale_type === 'kg';
  const hasAddons = (product.addon_groups ?? []).length > 0;
  const total     = price * qty;
  const imgUrl    = product.image_url;
  const grad      = getCategoryGradient(product.category_name ?? product.name);
  const emoji     = getProductEmoji(product.display_name ?? product.name);
  const badgeLabel = product.badge ? (badgeConfig[product.badge] ?? BADGE_DEFAULTS[product.badge]) : null;
  const badgeCls   = product.badge ? (BADGE_CLS[product.badge] ?? 'bg-amber-400 text-zinc-900') : null;

  // Sincroniza qty com o carrinho se o produto já estava lá ao abrir
  useEffect(() => {
    if (inCart?.qty && !added) setQty(inCart.qty);
  }, [inCart?.qty]);  // eslint-disable-line react-hooks/exhaustive-deps

  const dec = () => setQty(q => Math.max(1, q - 1));
  const inc = () => setQty(q => q + 1);

  const handleAddClick = useCallback(() => {
    if (added) return;
    setAdded(true);
    onAdd(product, qty);
    // Se tem addons, o parent fecha o modal e abre o AddonPicker imediatamente.
    // Se não tem addons, esperamos o feedback visual antes de fechar.
    if (!hasAddons) {
      setTimeout(onClose, 1050);
    }
  }, [added, product, qty, hasAddons, onAdd, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">

      {/* ── Backdrop ── */}
      <motion.div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* ── Painel — sobe de baixo ── */}
      <motion.div
        className="relative w-full max-w-lg bg-zinc-950 rounded-t-3xl flex flex-col overflow-hidden"
        style={{
          maxHeight: '93vh',
          boxShadow: '0 -8px 60px rgba(251,191,36,0.10), 0 0 0 1px rgba(251,191,36,0.07)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-0 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* ── Imagem hero ── */}
        <div className="relative shrink-0 mx-4 mt-3 rounded-2xl overflow-hidden"
          style={{ aspectRatio: '16/9' }}>
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={product.display_name ?? product.name}
              className="w-full h-full object-cover"
              loading="eager"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center text-7xl`}>
              {emoji}
            </div>
          )}

          {/* Fade inferior para transição suave ao conteúdo */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950/50 to-transparent pointer-events-none" />

          {/* Brilho dourado sutil na borda */}
          <div className="absolute inset-0 rounded-2xl ring-1 ring-amber-400/15 pointer-events-none" />

          {/* Botão X */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/75 transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Badge do produto */}
          {badgeLabel && (
            <div className="absolute top-3 left-3">
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-full shadow-lg ${badgeCls}`}>
                {badgeLabel}
              </span>
            </div>
          )}
        </div>

        {/* ── Corpo rolável ── */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 space-y-0">

          {/* Nome */}
          <h2 className="text-xl font-black text-white leading-tight tracking-tight">
            {product.display_name ?? product.name}
          </h2>

          {/* Descrição */}
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            {product.description || 'Clique em adicionar para incluir no carrinho.'}
          </p>

          {/* Selos de confiança */}
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {TRUST_BADGES.map(b => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-zinc-400 font-medium"
              >
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </span>
            ))}
          </div>

          {/* Preço */}
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400 tabular-nums">
              {fmtBRL(isKg ? price : total)}
            </span>
            {isKg
              ? <span className="text-sm text-zinc-500 font-semibold">/kg</span>
              : qty > 1 && <span className="text-sm text-zinc-500">({fmtBRL(price)} cada)</span>
            }
          </div>

          {/* Seletor de quantidade */}
          {!isKg && (
            <div className="flex items-center justify-between mt-4 bg-white/[0.04] rounded-2xl px-4 py-3 border border-white/[0.06]">
              <span className="text-sm text-zinc-300 font-semibold">Quantidade</span>
              <div className="flex items-center gap-4">
                <button
                  onClick={dec}
                  disabled={qty <= 1}
                  className="w-9 h-9 rounded-xl bg-zinc-800 border border-white/10 text-white font-black text-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 hover:bg-zinc-700"
                >
                  −
                </button>
                <span className="w-7 text-center font-black text-white text-lg tabular-nums select-none">
                  {qty}
                </span>
                <button
                  onClick={inc}
                  className="w-9 h-9 rounded-xl bg-amber-400 text-zinc-900 font-black text-xl flex items-center justify-center transition-all active:scale-90 hover:bg-amber-300"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Aviso de personalização */}
          {hasAddons && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-400/[0.07] border border-amber-400/20">
              <span>🍟</span>
              <span className="text-xs text-amber-300 font-medium">
                Este produto tem opções de personalização
              </span>
            </div>
          )}

          {/* Espaço extra para o botão fixo não cobrir conteúdo */}
          <div className="h-4" />
        </div>

        {/* ── Botão fixo no rodapé ── */}
        <div className="px-5 pb-7 pt-3 shrink-0 border-t border-white/[0.06] bg-zinc-950">
          <AnimatePresence mode="wait">
            {added && !hasAddons ? (
              <motion.div
                key="feedback"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="w-full py-4 rounded-2xl bg-green-500 text-white font-black text-base flex items-center justify-center gap-2 shadow-lg"
              >
                Produto adicionado ao carrinho ✅
              </motion.div>
            ) : (
              <motion.button
                key="addBtn"
                whileTap={{ scale: 0.97 }}
                onClick={handleAddClick}
                className="w-full py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-900 font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-400/25 transition-colors active:scale-95"
              >
                <span className="text-xl leading-none">+</span>
                <span>
                  {isKg
                    ? 'Adicionar ao carrinho'
                    : hasAddons
                      ? `Adicionar · ${fmtBRL(price)}`
                      : `Adicionar${qty > 1 ? ` ${qty}×` : ''} · ${fmtBRL(total)}`
                  }
                </span>
                {hasAddons && (
                  <span className="text-[11px] opacity-60 font-semibold">· personalizar</span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
