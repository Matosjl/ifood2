import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getVazamentos } from '../api/consumo';

const fmt = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const Delta = ({ v }) => {
  if (!v || v === 0) return <span className="text-gray-600 text-[10px]">—</span>;
  const up = v > 0;
  return (
    <span className={`text-[10px] font-semibold ${up ? 'text-red-400' : 'text-green-400'}`}>
      {up ? '▲' : '▼'} {fmt(Math.abs(v))} vs mês ant.
    </span>
  );
};

const CATEGORIAS = [
  { key: 'consumo_interno', emoji: '🍽', label: 'Consumo Interno', color: 'orange' },
  { key: 'perdas',          emoji: '🗑', label: 'Perdas',          color: 'red'    },
  { key: 'cancelamentos',   emoji: '❌', label: 'Cancelamentos',   color: 'red'    },
  { key: 'diferenca_caixa', emoji: '💰', label: 'Diferença Caixa', color: 'yellow' },
];

const COLOR_MAP = {
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  red:    'text-red-400 bg-red-500/10 border-red-500/20',
  yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

const TIPO_BREAKDOWN = {
  funcionario: { emoji: '👨‍🍳', label: 'Funcionários' },
  familia:     { emoji: '👨‍👩‍👦', label: 'Família'     },
  brinde:      { emoji: '🎁',  label: 'Brindes'      },
  degustacao:  { emoji: '🧪',  label: 'Degustações'  },
  perda:       { emoji: '🗑',  label: 'Perdas'        },
};

export default function VazamentosCard({ mes: mesProp }) {
  const mesAtual = mesProp || new Date().toISOString().slice(0, 7);
  const [mes,       setMes]       = useState(mesAtual);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(false);
  const [catAberta, setCatAberta] = useState(null); // key da categoria expandida

  useEffect(() => {
    setLoading(true);
    getVazamentos({ mes })
      .then(r => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [mes]);

  if (loading) {
    return (
      <div className="bg-gray-800/60 border border-white/[0.07] rounded-2xl p-4 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-32 mb-3" />
        <div className="h-8 bg-gray-700 rounded w-24" />
      </div>
    );
  }

  if (!data) return null;

  const total = data.total || 0;
  const pct   = data.total_pct || 0;

  return (
    <div className="bg-gray-800/60 border border-white/[0.07] rounded-2xl overflow-hidden">

      {/* Header clicável */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-4 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-lg">💸</span>
            <p className="text-sm font-black text-white">Vazamentos do mês</p>
          </div>
          {data.delta_anterior !== 0 && (
            <Delta v={data.delta_anterior} />
          )}
        </div>

        <div className="text-right flex items-center gap-3">
          <div>
            <p className="text-xl font-black text-red-400">{fmt(total)}</p>
            {pct > 0 && (
              <p className="text-[10px] text-gray-500 text-right">{pct}% do faturamento</p>
            )}
          </div>
          <svg className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Breakdown expandido */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* Seletor de mês */}
            <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/[0.05]">
              <p className="text-[10px] text-gray-500 font-semibold">Mês:</p>
              <input
                type="month"
                value={mes}
                onChange={e => setMes(e.target.value)}
                className="bg-gray-700 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500/50"
              />
            </div>

            <div className="px-4 pb-4 space-y-2">
              {CATEGORIAS.map(cat => {
                const info = data.categorias?.[cat.key];
                if (!info) return null;
                const val = info.total || 0;
                const pctCat = data.faturamento > 0
                  ? ((val / data.faturamento) * 100).toFixed(1)
                  : '0';
                const isOpen = catAberta === cat.key;

                return (
                  <div key={cat.key}
                    className={`rounded-xl border transition-colors ${COLOR_MAP[cat.color]}`}>
                    <button
                      type="button"
                      onClick={() => setCatAberta(isOpen ? null : cat.key)}
                      className="w-full flex items-center justify-between px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{cat.emoji}</span>
                        <span className="text-xs font-semibold truncate">{cat.label}</span>
                        {info.registros > 0 && (
                          <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded-full">
                            {info.registros}×
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Delta v={info.delta} />
                        <span className="text-xs font-black">{fmt(val)}</span>
                        {(cat.key === 'consumo_interno' && info.breakdown) && (
                          <svg className={`w-3 h-3 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </button>

                    {/* Sub-breakdown de consumo interno */}
                    <AnimatePresence>
                      {isOpen && cat.key === 'consumo_interno' && info.breakdown && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden px-3 pb-3"
                        >
                          <div className="border-t border-white/10 pt-2 space-y-1.5">
                            {Object.entries(info.breakdown).map(([tipo, valor]) => {
                              if (!valor) return null;
                              const t = TIPO_BREAKDOWN[tipo];
                              return (
                                <div key={tipo} className="flex items-center justify-between text-[11px]">
                                  <span className="text-gray-400">
                                    {t?.emoji} {t?.label || tipo}
                                  </span>
                                  <span className="font-semibold text-white">{fmt(valor)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {total === 0 && (
                <p className="text-xs text-gray-600 italic text-center py-4">
                  Nenhum vazamento registrado este mês. 🎉
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
