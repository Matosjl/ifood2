import { useState, useEffect } from 'react';
import { printOrder } from '../utils/print';

// ── Status config ─────────────────────────────────────────────

const STATUS = {
  pending:   { label: 'Pendente',   border: 'border-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300' },
  confirmed: { label: 'Confirmado', border: 'border-yellow-400', badge: 'bg-yellow-400/20 text-yellow-200' },
  preparing: { label: 'Em Preparo', border: 'border-blue-500',   badge: 'bg-blue-500/20   text-blue-300'   },
  ready:     { label: 'Pronto',     border: 'border-green-400',  badge: 'bg-green-400/20  text-green-300'  },
  delivered: { label: 'Entregue',   border: 'border-green-600',  badge: 'bg-green-600/20  text-green-400'  },
  cancelled: { label: 'Cancelado',  border: 'border-red-500',    badge: 'bg-red-500/20    text-red-300'    },
};

// Formas de pagamento aceitas no "Receber Pagamento"
const PAY_OPTIONS = [
  { value: 'cash',    label: '💵 Dinheiro' },
  { value: 'pix',     label: '📱 Pix'      },
  { value: 'credit',  label: '💳 Crédito'  },
  { value: 'debit',   label: '💳 Débito'   },
  { value: 'voucher', label: '🎫 Vale'      },
  { value: 'other',   label: '🔖 Outro'    },
];

const PAY_ICONS = { cash: '💵', pix: '📱', credit: '💳', debit: '💳', voucher: '🎫', fiado: '🤝', pending: '⏳', other: '🔖' };
const PAY_LABELS = { cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito', debit: 'Débito', voucher: 'Vale', fiado: 'Fiado', pending: 'A cobrar', other: 'Outro' };

// Statuses onde edição de itens é permitida
const EDITABLE_STATUSES = new Set(['pending', 'confirmed', 'preparing']);

// ── Timer ─────────────────────────────────────────────────────

function Timer({ createdAt }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const origin = new Date(createdAt).getTime();
    const tick   = () => setSecs(Math.max(0, Math.floor((Date.now() - origin) / 1_000)));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [createdAt]);

  const m   = Math.floor(secs / 60);
  const s   = secs % 60;
  const cls = m >= 20 ? 'text-red-400 animate-pulse-slow'
            : m >= 10 ? 'text-yellow-400'
            :           'text-gray-400';

  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${cls}`}>
      ⏱ {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ── Card ──────────────────────────────────────────────────────

export default function OrderCard({ order, onStatusChange, onAcknowledge, onMarkPaid, onEditItems }) {
  const [isNew,        setIsNew]        = useState(true);
  const [confirming,   setConfirming]   = useState(null);   // status sendo confirmado
  const [showPayPick,  setShowPayPick]  = useState(false);  // picker de forma de pgto
  const [payLoading,   setPayLoading]   = useState(false);
  const cfg = STATUS[order.status] ?? STATUS.pending;

  // Pagamento pendente: criado com 'A cobrar' e ainda não recebido
  const isPendingPayment = order.paymentMethod === 'pending' && !order.paidAt;

  useEffect(() => {
    const t = setTimeout(() => setIsNew(false), 600);
    return () => clearTimeout(t);
  }, []);

  // ── Actions ───────────────────────────────────────────────

  const handleAction = (action) => {
    onAcknowledge?.(order.id);
    if (action.confirm) setConfirming(action.status);
    else onStatusChange(order.id, action.status);
  };

  const confirmAction = () => {
    onStatusChange(order.id, confirming);
    setConfirming(null);
  };

  const handleReceivePay = async (method) => {
    setPayLoading(true);
    try {
      await onMarkPaid?.(order.id, method);
      setShowPayPick(false);
    } finally {
      setPayLoading(false);
    }
  };

  // Botões de ação dinâmicos (variam pelo status + estado de pagamento)
  const actions = (() => {
    const deliver  = { label: 'Entregar', status: 'delivered', cls: 'btn-green' };
    const cancel   = { label: 'Cancelar', status: 'cancelled', cls: 'btn-red', confirm: true };
    const prepare  = { label: 'Iniciar Preparo', status: 'preparing', cls: 'btn-blue' };
    const ready    = { label: 'Pronto!',  status: 'ready',     cls: 'btn-green' };

    switch (order.status) {
      case 'pending':
      case 'confirmed': return [prepare, cancel];
      case 'preparing': return [ready,   cancel];
      case 'ready':
        // Só mostra "Entregar" se pagamento já foi recebido (ou não era pendente)
        return isPendingPayment ? [] : [deliver];
      default:          return [];
    }
  })();

  const isEditable = EDITABLE_STATUSES.has(order.status);

  return (
    <div
      className={[
        'relative rounded-xl border-l-4 bg-gray-800/80 backdrop-blur-sm',
        'shadow-lg ring-1 ring-white/5',
        'transition-all duration-200 hover:bg-gray-800 hover:shadow-xl hover:-translate-y-0.5',
        cfg.border,
        isNew ? 'order-card-enter' : '',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-black text-white shrink-0">#{order.orderNumber}</span>
          {order.channel && order.channel !== 'manual' && (
            <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-medium">
              {order.channel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Timer createdAt={order.createdAt} />

          {/* Editar itens (só em statuses editáveis) */}
          {isEditable && onEditItems && (
            <button
              onClick={() => onEditItems(order)}
              title="Editar itens do pedido"
              className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {/* Imprimir */}
          <button
            onClick={() => printOrder(order)}
            title="Imprimir pedido"
            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>

          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Customer */}
      {(order.customerName || order.customerPhone) && (
        <div className="px-3 pb-1">
          {order.customerName  && <p className="text-sm font-medium text-gray-200 truncate">{order.customerName}</p>}
          {order.customerPhone && <p className="text-xs text-gray-400">{order.customerPhone}</p>}
        </div>
      )}

      {/* Items */}
      <ul className="px-3 py-1.5 space-y-0.5 border-t border-white/5">
        {(order.items ?? []).map((item, i) => (
          <li key={item.id ?? i} className="flex justify-between items-baseline gap-2">
            <span className="text-sm text-gray-300 truncate leading-5">
              {item.weightKg ? `${item.weightKg}kg` : `${item.quantity}×`} {item.productName}
            </span>
            <span className="text-xs text-gray-500 shrink-0">R$ {parseFloat(item.total).toFixed(2)}</span>
          </li>
        ))}
      </ul>

      {/* Footer: total + pagamento */}
      <div className="px-3 pt-1.5 pb-2 border-t border-white/5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-base font-black text-white">R$ {parseFloat(order.total).toFixed(2)}</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {order.deliveryType === 'delivery'
              ? <span className="text-xs text-blue-300 font-medium">🛵 Entrega</span>
              : <span className="text-xs text-gray-500 font-medium">🏪 Retirada</span>
            }
            <span className="text-xs text-gray-500">·</span>
            {isPendingPayment ? (
              <span className="text-xs font-semibold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                ⏳ A cobrar
              </span>
            ) : order.paidAt ? (
              <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                ✓ Pago · {PAY_ICONS[order.paymentMethod] ?? '💵'} {PAY_LABELS[order.paymentMethod] ?? order.paymentMethod}
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                {PAY_ICONS[order.paymentMethod] ?? '💵'} {PAY_LABELS[order.paymentMethod] ?? order.paymentMethod}
              </span>
            )}
          </div>
        </div>
        {order.notes && (
          <span className="text-xs text-amber-400/80 italic truncate block" title={order.notes}>
            💬 {order.notes}
          </span>
        )}
      </div>

      {/* Picker inline de forma de pagamento */}
      {showPayPick && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          <p className="text-xs text-gray-400 font-semibold">Selecione a forma de pagamento:</p>
          <div className="grid grid-cols-3 gap-1">
            {PAY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                disabled={payLoading}
                onClick={() => handleReceivePay(value)}
                className="py-1.5 px-1 rounded-lg text-xs font-semibold bg-gray-700/80 hover:bg-green-600/30 hover:text-green-300 text-gray-300 transition-colors disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPayPick(false)}
            className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Actions */}
      {!showPayPick && (
        <div className="px-3 pb-3 flex gap-2 flex-wrap">
          {confirming ? (
            <>
              <span className="text-xs text-red-400 self-center">Confirmar cancelamento?</span>
              <button onClick={confirmAction}             className="btn-red   flex-1">Sim</button>
              <button onClick={() => setConfirming(null)} className="btn-ghost flex-1">Não</button>
            </>
          ) : (
            <>
              {/* Botão "Receber Pagamento" aparece quando status não é final e pagamento pendente */}
              {isPendingPayment && !['delivered', 'cancelled'].includes(order.status) && (
                <button
                  onClick={() => setShowPayPick(true)}
                  className="btn-base flex-1 bg-orange-600 hover:bg-orange-500 text-white focus-visible:ring-orange-500"
                >
                  💰 Receber
                </button>
              )}

              {/* Botões de progressão de status */}
              {actions.map((a) => (
                <button
                  key={a.status}
                  onClick={() => handleAction(a)}
                  className={`${a.cls} flex-1 min-w-0`}
                >
                  {a.label}
                </button>
              ))}

              {/* Botão "Entregar" bloqueado visualmente quando não pago */}
              {order.status === 'ready' && isPendingPayment && (
                <button
                  disabled
                  title="Registre o pagamento antes de entregar"
                  className="btn-base flex-1 bg-gray-700 text-gray-500 cursor-not-allowed"
                >
                  🔒 Entregar
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
