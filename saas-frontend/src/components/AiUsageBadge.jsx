import { useState, useEffect } from 'react';
import { getManagerAlerts } from '../api/ai';

/**
 * AiUsageBadge — exibe alertas de IA no header do restaurante.
 * Aparece como um pequeno badge se houver alertas ativos.
 */
export default function AiUsageBadge() {
  const [alerts, setAlerts] = useState([]);
  const [open,   setOpen]   = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        const { data } = await getManagerAlerts();
        if (!cancelled) setAlerts(data.data?.alerts ?? []);
      } catch {
        // silencia — AI pode estar indisponível
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    const timer = setInterval(fetch, 5 * 60 * 1000); // re-verifica a cada 5min
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!alerts.length && !loading) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Alertas IA"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors text-xs font-bold"
      >
        <span>🤖</span>
        {alerts.length > 0 && (
          <span className="bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">
            {alerts.length}
          </span>
        )}
      </button>

      {open && alerts.length > 0 && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-black text-white">⚠️ Alertas IA</p>
          </div>
          <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
            {alerts.map((alert, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-xs text-amber-300 font-semibold">{alert.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{alert.message}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-white/[0.06]">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
