import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getVazamentos } from '../api/consumo';

const fmt = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v) => `${Number(v ?? 0).toFixed(1)}%`;

function Delta({ v }) {
  if (!v || v === 0) return null;
  const up = v > 0;
  return (
    <span className={`text-[10px] font-semibold ${up ? 'text-red-400' : 'text-green-400'}`}>
      {up ? '▲' : '▼'} {fmt(Math.abs(v))} vs ant.
    </span>
  );
}

const VAZAMENTOS = [
  {
    key: 'desvio_cmv', emoji: '📊', label: 'Desvio de CMV', color: 'red',
    desc: 'Consumiu mais que o previsto pelas fichas técnicas.',
    cond: (d) => d?.total > 0,
    renderDetail: (d) => d?.cmv_teorico != null ? (
      <div className="space-y-1 pt-2 border-t border-white/10 text-[11px]">
        <div className="flex justify-between">
          <span className="text-gray-400">CMV Teórico (fichas)</span>
          <span className="text-gray-300 font-semibold">{fmt(d.cmv_teorico)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">CMV Real (registrado)</span>
          <span className="text-gray-300 font-semibold">{fmt(d.cmv_real)}</span>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-1">
          <span className="text-red-400 font-semibold">Desvio</span>
          <span className="text-red-400 font-black">{fmt(d.total)}</span>
        </div>
      </div>
    ) : null,
  },
  {
    key: 'produtos_sem_custo', emoji: '⚠️', label: 'Produtos sem custo', color: 'orange',
    desc: 'Vendas com CMV desconhecido — lucro pode estar inflado.',
    cond: (d) => d?.registros > 0,
    useReceita: true,
    renderDetail: (d) => (
      <div className="pt-2 border-t border-white/10 text-[11px]">
        <p className="text-gray-400">
          {d.registros} produto{d.registros !== 1 ? 's' : ''} com <strong className="text-white">custo = R$0</strong> e sem ficha técnica.
        </p>
        <p className="text-orange-300 mt-1">
          Receita afetada: <strong>{fmt(d.receita_afetada)}</strong> — o custo real é desconhecido.
        </p>
      </div>
    ),
  },
  {
    key: 'taxas_cartao', emoji: '💳', label: 'Taxas de cartão', color: 'yellow',
    desc: 'Estimativa de taxas sobre vendas em crédito, débito e voucher.',
    cond: (d) => d?.total > 0,
    renderDetail: (d) => (
      <div className="pt-2 border-t border-white/10 text-[11px] space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-400">Base (crédito+débito+voucher)</span>
          <span className="text-gray-300">{fmt(d.base_cartao)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Taxa estimada</span>
          <span className="text-gray-300">{d.taxa_pct}%</span>
        </div>
        <p className="text-gray-600 pt-1">Taxa real depende da maquininha.</p>
      </div>
    ),
  },
  {
    key: 'fiado_vencido', emoji: '🤝', label: 'Fiado em aberto +30 dias', color: 'purple',
    desc: 'Dívidas de clientes com mais de 30 dias sem pagamento.',
    cond: (d) => d?.total > 0,
    isRisco: true,
    renderDetail: (d) => (
      <div className="pt-2 border-t border-white/10 text-[11px]">
        <p className="text-gray-400">
          {d.registros} compra{d.registros !== 1 ? 's' : ''} em aberto há mais de 30 dias.
        </p>
        <p className="text-purple-300 mt-1">Vá em <strong>Fiado</strong> para cobrar ou negociar.</p>
      </div>
    ),
  },
  {
    key: 'consumo_interno', emoji: '🍽', label: 'Consumo Interno', color: 'orange',
    desc: 'Funcionários, família, brindes, degustações e perdas registradas.',
    cond: (d) => d?.total > 0 || d?.registros > 0,
    renderDetail: (d) => {
      const TIPOS = {
        funcionario: { emoji: '👨‍🍳', label: 'Funcionários' },
        familia:     { emoji: '👨‍👩‍👦', label: 'Família' },
        brinde:      { emoji: '🎁',  label: 'Brindes' },
        degustacao:  { emoji: '🧪',  label: 'Degustações' },
        perda:       { emoji: '🗑',  label: 'Perdas' },
      };
      if (!d.breakdown) return null;
      return (
        <div className="pt-2 border-t border-white/10 space-y-1">
          {Object.entries(d.breakdown).map(([tipo, valor]) => {
            if (!valor) return null;
            const t = TIPOS[tipo];
            return (
              <div key={tipo} className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">{t?.emoji} {t?.label || tipo}</span>
                <span className="font-semibold text-white">{fmt(valor)}</span>
              </div>
            );
          })}
        </div>
      );
    },
  },
  {
    key: 'perdas', emoji: '🗑', label: 'Perdas de insumos', color: 'red',
    desc: 'Insumos descartados registrados no módulo de produção.',
    cond: (d) => d?.total > 0, renderDetail: null,
  },
  {
    key: 'cancelamentos', emoji: '❌', label: 'Cancelamentos', color: 'red',
    desc: 'Valor total de pedidos cancelados no período.',
    cond: (d) => d?.total > 0, renderDetail: null,
  },
  {
    key: 'diferenca_caixa', emoji: '💰', label: 'Diferença de caixa', color: 'yellow',
    desc: 'Soma das discrepâncias nos fechamentos de caixa.',
    cond: (d) => d?.total > 0, renderDetail: null,
  },
];

const COLOR_MAP = {
  red:    { card: 'border-red-500/20 bg-red-500/5',      text: 'text-red-400' },
  orange: { card: 'border-orange-500/20 bg-orange-500/5', text: 'text-orange-400' },
  yellow: { card: 'border-yellow-500/20 bg-yellow-500/5', text: 'text-yellow-400' },
  purple: { card: 'border-purple-500/20 bg-purple-500/5', text: 'text-purple-400' },
};

function VazCard({ config, data }) {
  const [open, setOpen] = useState(false);
  if (!config.cond(data)) return null;
  const c     = COLOR_MAP[config.color] || COLOR_MAP.red;
  const valor = config.useReceita ? data.receita_afetada : (data.total || 0);
  const isRisco = config.isRisco;
  return (
    <div className={`rounded-xl border ${c.card} overflow-hidden`}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{config.emoji}</span>
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${c.text} truncate`}>{config.label}</p>
            {data.registros > 0 && (
              <p className="text-[10px] text-gray-600">{data.registros} ocorrência{data.registros !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Delta v={data.delta} />
          <div className="text-right">
            <p className={`text-sm font-black ${isRisco ? 'text-purple-400' : c.text}`}>
              {isRisco ? '⚠ ' : ''}{fmt(valor)}
            </p>
            {data.pct > 0 && !isRisco && (
              <p className="text-[10px] text-gray-600">{fmtPct(data.pct)} fat.</p>
            )}
          </div>
          {config.renderDetail && (
            <svg className={`w-3 h-3 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>
      <AnimatePresence>
        {open && config.renderDetail && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden px-3 pb-3">
            {config.renderDetail(data)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function VazamentosCard({ mes: mesProp }) {
  const mesAtual  = mesProp || new Date().toISOString().slice(0, 7);
  const [mes,      setMes]      = useState(mesAtual);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);

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
        <div className="h-4 bg-gray-700 rounded w-40 mb-3" />
        <div className="h-10 bg-gray-700 rounded w-32" />
      </div>
    );
  }

  if (!data) return null; // erro de API — silencioso

  const total      = data.total || 0;
  const pct        = data.total_pct || 0;
  const cats       = data.categorias || {};
  const riscoFiado = cats.fiado_vencido?.total || 0;
  const urgente    = pct > 10;

  return (
    <div className={`rounded-2xl overflow-hidden border transition-colors ${
      urgente ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.07] bg-gray-800/60'
    }`}>
      <button type="button" onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span>
            <div>
              <p className="text-sm font-black text-white">Centro de Vazamentos</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {pct > 0 ? `${fmtPct(pct)} do faturamento em risco` : 'Nenhum vazamento registrado'}
              </p>
            </div>
          </div>
          {data.delta_anterior !== 0 && <Delta v={data.delta_anterior} />}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={`text-2xl font-black ${urgente ? 'text-red-400' : 'text-orange-400'}`}>
              {fmt(total)}
            </p>
            {riscoFiado > 0 && (
              <p className="text-[10px] text-purple-400">+ {fmt(riscoFiado)} risco fiado</p>
            )}
          </div>
          <svg className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden">
            <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/[0.05]">
              <p className="text-[10px] text-gray-500 font-semibold">Mês:</p>
              <input type="month" value={mes} onChange={e => setMes(e.target.value)}
                className="bg-gray-700 border border-white/10 rounded-lg px-2 py-1 text-xs text-white
                           focus:outline-none focus:border-orange-500/50" />
              <p className="text-[10px] text-gray-600 ml-auto">Fat.: {fmt(data.faturamento)}</p>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {VAZAMENTOS.map(config => {
                const catData = cats[config.key];
                if (!catData) return null;
                return <VazCard key={config.key} config={config} data={catData} />;
              })}
              {total === 0 && riscoFiado === 0 && (
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
