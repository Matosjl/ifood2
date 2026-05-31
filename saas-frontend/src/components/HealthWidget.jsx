/**
 * HealthWidget — saúde operacional em tempo real.
 * Score 0-100 calculado no backend com base em:
 * pedidos esquecidos, cancelamentos, caixa, estoque, CMV.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const COLOR = {
  green:  { ring: 'stroke-green-500',  text: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  blue:   { ring: 'stroke-blue-500',   text: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  yellow: { ring: 'stroke-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  red:    { ring: 'stroke-red-500',    text: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
};

// SVG ring gauge
function ScoreRing({ score, color }) {
  const r   = 22;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - score / 100);
  const c    = COLOR[color] ?? COLOR.green;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="-rotate-90">
      <circle cx="30" cy="30" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-white/5" />
      <circle
        cx="30" cy="30" r={r} fill="none"
        strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={fill}
        className={`${c.ring} transition-all duration-700`}
      />
    </svg>
  );
}

export default function HealthWidget() {
  const [health,   setHealth]   = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/dashboard/health');
      setHealth(data.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, [load]);

  if (loading || !health) return null;

  const c  = COLOR[health.color] ?? COLOR.green;
  const urgent = health.deductions.filter((d) => d.urgent);

  return (
    <div className="mx-4 mt-2 shrink-0">
      {/* Collapsed: single line */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-colors ${c.bg} hover:opacity-90`}
      >
        {/* Ring */}
        <div className="relative shrink-0">
          <ScoreRing score={health.score} color={health.color} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-black tabular-nums ${c.text}`}>{health.score}</span>
          </div>
        </div>

        {/* Label */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-black ${c.text}`}>Saúde Operacional: {health.label}</p>
            {urgent.length > 0 && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full animate-pulse">
                🔴 {urgent.length} alerta{urgent.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {health.deductions.length === 0 ? (
            <p className="text-xs text-gray-500 mt-0.5">Operação saudável — continue assim! 🎉</p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {health.deductions[0].icon} {health.deductions[0].label}
              {health.deductions.length > 1 && ` +${health.deductions.length - 1} mais`}
            </p>
          )}
        </div>

        <span className="text-gray-600 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded: issue list */}
      {expanded && health.deductions.length > 0 && (
        <div className="mt-1 rounded-2xl border border-white/[0.06] bg-gray-900/70 overflow-hidden">
          {health.deductions.map((d) => (
            <div key={d.key} className={`flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 ${d.urgent ? 'bg-red-500/5' : ''}`}>
              <span className="text-lg shrink-0 mt-0.5">{d.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{d.label}</p>
                  <span className="text-[10px] text-red-400 font-bold shrink-0">-{d.penalty}pts</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{d.action}</p>
              </div>
            </div>
          ))}
          {/* Stats footer */}
          <div className="px-4 py-2 flex items-center gap-4 bg-gray-900/40 border-t border-white/[0.04]">
            <span className="text-[10px] text-gray-600">{health.stats.totalOrdersToday} pedidos hoje</span>
            {health.stats.cancelledToday > 0 && (
              <span className="text-[10px] text-red-500">{health.stats.cancelledToday} cancelados</span>
            )}
            {health.stats.cmvPct && (
              <span className="text-[10px] text-gray-600">CMV {health.stats.cmvPct.toFixed(1)}%</span>
            )}
            <button onClick={load} className="ml-auto text-[10px] text-gray-600 hover:text-gray-400">🔄 Atualizar</button>
          </div>
        </div>
      )}

      {expanded && health.deductions.length === 0 && (
        <div className="mt-1 px-4 py-3 rounded-2xl border border-green-500/20 bg-green-500/5 text-center">
          <p className="text-sm text-green-400 font-semibold">✅ Sem alertas no momento</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {health.stats.totalOrdersToday} pedidos · Operação normal
          </p>
        </div>
      )}
    </div>
  );
}
