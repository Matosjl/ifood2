/**
 * IncidentsBanner — faixa compacta no topo do dashboard.
 * Mostra incidentes abertos do dia + prejuízo acumulado.
 * Se não houver incidentes, não renderiza nada.
 * Auto-refresh a cada 5 minutos.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const TYPE_LABELS = {
  cash_difference:    '💰 Diferença de caixa',
  cash_change_missing:'💵 Troco não entregue',
  order_forgotten:    '⏰ Pedido esquecido',
  item_missing:       '📦 Item faltando',
  delivery_late:      '🛵 Entrega atrasada',
  cancellation:       '❌ Cancelamento',
};

const fmt = (n) => `R$ ${parseFloat(n || 0).toFixed(2).replace('.', ',')}`;

export default function IncidentsBanner() {
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/incidents/summary');
      setSummary(data.data);
    } catch { /* non-fatal — banner simplesmente não aparece */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Não mostra nada se não há incidentes abertos hoje
  if (!summary || summary.open === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-red-500/10 border-b border-red-500/20 shrink-0 overflow-x-auto">
      {/* Ícone + total */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm">🚨</span>
        <span className="text-xs font-black text-red-400">
          {summary.open} incidente{summary.open !== 1 ? 's' : ''} aberto{summary.open !== 1 ? 's' : ''}
        </span>
        {summary.open_cost > 0 && (
          <span className="text-xs font-bold text-red-300 bg-red-500/20 px-2 py-0.5 rounded-full">
            prejuízo: {fmt(summary.open_cost)}
          </span>
        )}
      </div>

      {/* Detalhamento por tipo */}
      {summary.by_type && (
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(summary.by_type || {}).map(([type, count]) => (
            <span key={type} className="text-[10px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">
              {TYPE_LABELS[type] ?? type}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Link para ver detalhes */}
      <button
        className="ml-auto shrink-0 text-[10px] font-bold text-red-400 hover:text-red-300 underline transition-colors"
        onClick={() => window.alert('Relatório de incidentes — Sprint C')}
      >
        ver todos →
      </button>
    </div>
  );
}
