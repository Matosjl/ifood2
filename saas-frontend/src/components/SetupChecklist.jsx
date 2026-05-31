/**
 * SetupChecklist — banner de configuração inicial para novos restaurantes.
 * Aparece na DashboardPage quando itens críticos ainda não foram configurados.
 * Desaparece automaticamente quando todos os itens estão completos.
 */
import { useState, useEffect } from 'react';
import api from '../api/axios';

const STORAGE_KEY = 'setup_checklist_dismissed_v1';

export default function SetupChecklist({ onNavigate }) {
  const [items,     setItems]     = useState(null); // null = loading
  const [dismissed, setDismissed] = useState(false);
  const [expanded,  setExpanded]  = useState(true);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) { setDismissed(true); return; }
    loadChecklist();
  }, []);

  const loadChecklist = async () => {
    try {
      const [productsRes, settingsRes, caixaRes] = await Promise.allSettled([
        api.get('/products?limit=1'),
        api.get('/tenant/full-settings'),
        api.get('/caixa/current'),
      ]);

      const pData = productsRes.status === 'fulfilled' ? productsRes.value.data : null;
      const productCount = pData
        ? (pData.total ?? pData.data?.total ?? pData.data?.data?.length ?? pData.data?.length ?? 0)
        : 0;

      const settings = settingsRes.status === 'fulfilled'
        ? (settingsRes.value.data.data ?? {})
        : null;

      const hasCaixa = caixaRes.status === 'fulfilled'
        ? !!(caixaRes.value.data.data?.id)
        : false;

      const checks = [
        {
          id:       'produto',
          label:    'Cadastrar primeiro produto',
          done:     productCount > 0,
          action:   () => onNavigate('products'),
          icon:     '🍽️',
          urgent:   true,
        },
        {
          id:       'caixa',
          label:    'Abrir o caixa',
          done:     hasCaixa,
          action:   () => onNavigate('financial'),
          icon:     '💰',
          urgent:   true,
        },
        {
          id:       'delivery',
          label:    'Configurar taxa de entrega',
          done:     settings && (settings.delivery_zones?.length > 0 || settings.delivery_zone_type != null),
          action:   () => onNavigate('settings'),
          icon:     '🛵',
          urgent:   false,
        },
        {
          id:       'payment',
          label:    'Definir formas de pagamento',
          done:     settings && (settings.accepted_payment_methods?.length > 0),
          action:   () => onNavigate('settings'),
          icon:     '💳',
          urgent:   false,
        },
      ];

      const pending = checks.filter((c) => !c.done);
      if (pending.length === 0) { setDismissed(true); return; }
      setItems(checks);
    } catch {
      setDismissed(true);
    }
  };

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  if (dismissed || items === null) return null;

  const doneCount  = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const pct        = Math.round((doneCount / totalCount) * 100);
  const pending    = items.filter((i) => !i.done);
  const hasUrgent  = pending.some((i) => i.urgent);

  return (
    <div className={`mx-4 mt-3 rounded-2xl border overflow-hidden shrink-0 ${hasUrgent ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/[0.08] bg-gray-900/50'}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xl">🚀</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">Configure seu restaurante</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden max-w-32">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{doneCount}/{totalCount} concluídos</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="text-xs text-gray-600 hover:text-gray-400 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            Fechar
          </button>
          <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Items */}
      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={item.done ? undefined : item.action}
              disabled={item.done}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                item.done
                  ? 'bg-green-500/10 border border-green-500/20 cursor-default'
                  : item.urgent
                    ? 'bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 cursor-pointer'
                    : 'bg-gray-800/60 border border-white/[0.06] hover:bg-gray-800 cursor-pointer'
              }`}
            >
              <span className="text-base shrink-0">{item.done ? '✅' : item.icon}</span>
              <span className={`text-xs font-semibold leading-tight ${item.done ? 'text-green-400 line-through opacity-70' : 'text-gray-200'}`}>
                {item.label}
              </span>
              {!item.done && item.urgent && (
                <span className="ml-auto text-[10px] text-orange-400 font-bold shrink-0">→</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
