import { useState, useEffect } from 'react';
import { printOrder, printKitchen } from '../utils/print';
import { PAY_ICONS, PAY_LABELS } from '../constants/orders';
import PixQrModal from './PixQrModal';
import api from '../api/axios';
import { listFiadoClientes, createFiadoCompra } from '../api/fiado';

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
  { value: 'fiado',   label: '🤝 Fiado'    },
];


// Statuses onde edição de itens é permitida
const EDITABLE_STATUSES = new Set(['pending', 'confirmed', 'preparing']);

// ── Timer ─────────────────────────────────────────────────────

function Timer({ createdAt, endAt }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const origin = new Date(createdAt).getTime();
    const end    = endAt ? new Date(endAt).getTime() : null;
    const tick   = () => {
      const ref = end ?? Date.now();
      setSecs(Math.max(0, Math.floor((ref - origin) / 1_000)));
    };
    tick();
    if (end) return; // pedido finalizado — não precisa de interval
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [createdAt, endAt]);

  const m   = Math.floor(secs / 60);
  const s   = secs % 60;
  const cls = endAt          ? 'text-gray-500'
            : m >= 20        ? 'text-red-400 animate-pulse-slow'
            : m >= 10        ? 'text-yellow-400'
            :                  'text-gray-400';

  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${cls}`}>
      ⏱ {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ── Card ──────────────────────────────────────────────────────

export default function OrderCard({ order, onStatusChange, onAcknowledge, onMarkPaid, onEditItems, drivers, onAssign }) {
  const [isNew,           setIsNew]           = useState(true);
  const [confirming,      setConfirming]       = useState(null);   // status sendo confirmado
  const [cancelReason,    setCancelReason]     = useState('');     // motivo do cancelamento
  const [showPayPick,     setShowPayPick]      = useState(false);  // picker de forma de pgto
  const [showPixModal,    setShowPixModal]     = useState(false);  // QR PIX
  const [payLoading,      setPayLoading]       = useState(false);
  const [fiadoMode,       setFiadoMode]        = useState(false);  // picker fiado
  const [fiadoClientes,   setFiadoClientes]    = useState([]);
  const [fiadoClienteId,  setFiadoClienteId]  = useState('');
  const [fiadoSearch,     setFiadoSearch]      = useState('');
  const [fiadoError,      setFiadoError]       = useState('');
  const [showDriverPick,  setShowDriverPick]   = useState(false);  // picker de motoboy
  const [assigning,       setAssigning]        = useState(false);
  const [changeConfirmed, setChangeConfirmed]  = useState(
    order.cashChangeConfirmed !== undefined ? order.cashChangeConfirmed : null
  ); // null = pendente, true = entregue, false = não entregue
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
    if (action.confirm) { setCancelReason(''); setConfirming(action.status); }
    else onStatusChange(order.id, action.status);
  };

  const confirmAction = () => {
    onStatusChange(order.id, confirming, confirming === 'cancelled' ? cancelReason : undefined);
    setConfirming(null);
    setCancelReason('');
  };

  const handleReceivePay = async (method) => {
    if (method === 'fiado') {
      // Carrega clientes e abre picker
      setFiadoError('');
      setFiadoClienteId('');
      setFiadoSearch('');
      try {
        const { data } = await listFiadoClientes({});
        setFiadoClientes((data.data ?? []).filter((c) => !c.bloqueado));
      } catch { setFiadoClientes([]); }
      setFiadoMode(true);
      return;
    }
    setPayLoading(true);
    try {
      await onMarkPaid?.(order.id, method);
      setShowPayPick(false);
    } finally {
      setPayLoading(false);
    }
  };

  const handleConfirmFiado = async () => {
    if (!fiadoClienteId) { setFiadoError('Selecione o cliente do fiado.'); return; }
    setPayLoading(true);
    setFiadoError('');
    try {
      await onMarkPaid?.(order.id, 'fiado');
      await createFiadoCompra({
        cliente_id: fiadoClienteId,
        order_id:   order.id,
        descricao:  `Pedido #${order.orderNumber}`,
        valor:      order.total,
      });
      setFiadoMode(false);
      setShowPayPick(false);
    } catch { setFiadoError('Erro ao lançar fiado. Tente novamente.'); }
    finally { setPayLoading(false); }
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
        if (isPendingPayment) return [];
        // Para delivery: motoboy faz a entrega — só mostra "Entregar" se não há onAssign
        if (order.deliveryType === 'delivery' && onAssign) return [];
        return [deliver];
      default:          return [];
    }
  })();

  const isEditable       = EDITABLE_STATUSES.has(order.status);
  const availableDrivers = (drivers ?? []).filter(
    (d) => d.status === 'available' || d.status === 'busy'
  );

  const handleAssignDriver = async (driverId) => {
    setAssigning(true);
    setShowDriverPick(false);
    try {
      await onAssign?.(order.id, driverId);
    } finally {
      setAssigning(false);
    }
  };

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
          {order.tableNumber && (
            <span className="text-xs bg-orange-500/25 text-orange-300 px-1.5 py-0.5 rounded font-bold">
              🪑 Mesa {order.tableNumber}
            </span>
          )}
          {order.channel && order.channel !== 'manual' && (
            <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-medium">
              {order.channel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Timer createdAt={order.createdAt}
            endAt={['delivered','cancelled'].includes(order.status) ? order.updatedAt : null} />

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

          {/* Imprimir recibo (58mm) */}
          <button
            onClick={() => printOrder(order)}
            title="Imprimir recibo do cliente (58mm)"
            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>

          {/* Imprimir comanda de cozinha (80mm) */}
          <button
            onClick={() => printKitchen(order, 'kitchen')}
            title="Imprimir comanda de cozinha (80mm)"
            className="p-1 rounded text-gray-600 hover:text-orange-400 hover:bg-orange-400/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>
              <line x1="6" y1="17" x2="18" y2="17"/>
            </svg>
          </button>

          {/* Imprimir comanda do bar (80mm) — aparece só se tiver itens de bar */}
          {(order.items ?? []).some((i) => {
            const t = i.printerTarget ?? i.printer_target ?? 'kitchen';
            return t === 'bar' || t === 'both';
          }) && (
            <button
              onClick={() => printKitchen(order, 'bar')}
              title="Imprimir comanda do bar (80mm)"
              className="p-1 rounded text-gray-600 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 11H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1Z"/>
                <path d="M16 11V6a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v5"/>
                <line x1="12" y1="16" x2="12" y2="20"/>
              </svg>
            </button>
          )}

          {/* Gerar QR PIX */}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <button
              onClick={() => setShowPixModal(true)}
              title="Gerar QR Code PIX"
              className="p-1 rounded text-gray-600 hover:text-green-400 hover:bg-green-400/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/>
                <rect x="2" y="14" width="8" height="8" rx="1"/>
                <path d="M14 14h2v2h-2zm4 0h2v2h-2zm0 4h-4v4h4v-4z"/>
              </svg>
            </button>
          )}

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
          <li key={item.id ?? i} className="space-y-0">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-sm text-gray-300 truncate leading-5">
                {item.weightKg ? `${item.weightKg}kg` : `${item.quantity}×`} {item.productName}
              </span>
              <span className="text-xs text-gray-500 shrink-0">R$ {parseFloat(item.total).toFixed(2)}</span>
            </div>
            {item.notes && (
              <p className="text-[11px] text-amber-400 pl-1">↳ {item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Footer: total + pagamento */}
      <div className="px-3 pt-1.5 pb-2 border-t border-white/5 space-y-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-black text-white tabular-nums whitespace-nowrap">
              R$&nbsp;{parseFloat(order.total).toFixed(2).replace('.', ',')}
            </span>
            {order.deliveryType === 'delivery' ? (
              <span className="text-xs text-blue-300 font-medium whitespace-nowrap">
                🛵 Entrega{order.deliveryFee > 0 ? ` +R$${parseFloat(order.deliveryFee).toFixed(2).replace('.', ',')}` : ''}
              </span>
            ) : (
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">🏪 Retirada</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {isPendingPayment ? (
              <span className="text-xs font-semibold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                ⏳ A cobrar
              </span>
            ) : order.paidAt ? (
              <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                ✓ Pago · {PAY_ICONS[order.paymentMethod] ?? '💵'} {PAY_LABELS[order.paymentMethod] ?? order.paymentMethod}
              </span>
            ) : (
              <>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {PAY_ICONS[order.paymentMethod] ?? '💵'} {PAY_LABELS[order.paymentMethod] ?? order.paymentMethod}
                </span>
                {/* Botão de confirmação de pagamento para pedidos sem paid_at */}
                {!['cancelled'].includes(order.status) && (
                  <button
                    onClick={() => setShowPayPick(true)}
                    className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
                  >
                    ✓ Confirmar pag.
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {/* ⚠️ ALERTA DE TROCO — com confirmação pós-entrega */}
        {order.cashChangeRequired > 0 && (
          <div className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 mt-1 border ${
            changeConfirmed === true  ? 'bg-green-500/10 border-green-500/30' :
            changeConfirmed === false ? 'bg-red-500/10   border-red-500/30'   :
                                        'bg-yellow-500/20 border-yellow-500/50'
          }`}>
            <span className="text-base shrink-0 mt-0.5">
              {changeConfirmed === true ? '✅' : changeConfirmed === false ? '❌' : '💵'}
            </span>
            <div className="min-w-0 flex-1">
              {changeConfirmed === true ? (
                <p className="text-xs font-semibold text-green-400 leading-none">Troco R$ {order.cashChangeRequired.toFixed(2).replace('.', ',')} entregue</p>
              ) : changeConfirmed === false ? (
                <p className="text-xs font-semibold text-red-400 leading-none">Troco não entregue — incidente criado</p>
              ) : (
                <>
                  <p className="text-xs font-black text-yellow-300 leading-none">
                    LEVAR R$ {order.cashChangeRequired.toFixed(2).replace('.', ',')} DE TROCO
                  </p>
                  <p className="text-[10px] text-yellow-500 mt-0.5">
                    Cliente paga R$ {order.cashChangeFor.toFixed(2).replace('.', ',')}
                  </p>
                  {/* Botões de confirmação — aparecem após o pedido ser entregue */}
                  {['delivering','delivered'].includes(order.status) && (
                    <div className="flex gap-1.5 mt-1.5">
                      <button
                        onClick={async () => {
                          await api.patch(`/incidents/confirm-change/${order.id}`, { delivered: true }).catch(() => {});
                          setChangeConfirmed(true);
                        }}
                        className="flex-1 text-[10px] font-bold py-1 rounded-lg bg-green-600/30 hover:bg-green-600/50 text-green-300 border border-green-500/30 transition-colors"
                      >
                        ✓ Entregue
                      </button>
                      <button
                        onClick={async () => {
                          await api.patch(`/incidents/confirm-change/${order.id}`, { delivered: false }).catch(() => {});
                          setChangeConfirmed(false);
                        }}
                        className="flex-1 text-[10px] font-bold py-1 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/30 transition-colors"
                      >
                        ✗ Não entregue
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {order.notes && (
          <span className="text-xs text-amber-400/80 italic truncate block" title={order.notes}>
            💬 {order.notes}
          </span>
        )}
      </div>

      {/* Picker inline de forma de pagamento */}
      {showPayPick && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          {!fiadoMode ? (
            <>
              <p className="text-xs text-gray-400 font-semibold">✓ Confirmar pagamento recebido:</p>
              <div className="grid grid-cols-3 gap-1">
                {PAY_OPTIONS.filter(o => o.value !== 'pending').map(({ value, label }) => (
                  <button
                    key={value}
                    disabled={payLoading}
                    onClick={() => handleReceivePay(value)}
                    className={`py-1.5 px-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      value === 'fiado'
                        ? 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300'
                        : order.paymentMethod === value
                          ? 'bg-green-600/40 text-green-200 border border-green-500/50'
                          : 'bg-gray-700/80 hover:bg-green-600/30 hover:text-green-300 text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowPayPick(false)}
                className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1">
                Cancelar
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-purple-400 font-semibold">🤝 Lançar no Fiado — selecione o cliente:</p>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={fiadoSearch}
                onChange={(e) => setFiadoSearch(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <div className="max-h-32 overflow-y-auto space-y-0.5 rounded-lg border border-white/[0.06] bg-gray-800/60">
                {fiadoClientes
                  .filter((c) => !fiadoSearch || c.name.toLowerCase().includes(fiadoSearch.toLowerCase()))
                  .map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => setFiadoClienteId(c.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        fiadoClienteId === c.id
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}>
                      {c.name}
                      {parseFloat(c.total_aberto) > 0 && (
                        <span className="ml-2 text-yellow-400 text-[10px]">
                          Deve R${parseFloat(c.total_aberto).toFixed(2)}
                        </span>
                      )}
                    </button>
                  ))}
                {fiadoClientes.length === 0 && (
                  <p className="text-xs text-gray-600 italic px-3 py-2">Nenhum cliente de fiado cadastrado.</p>
                )}
              </div>
              {fiadoError && <p className="text-xs text-red-400">{fiadoError}</p>}
              <div className="flex gap-2">
                <button onClick={handleConfirmFiado} disabled={payLoading || !fiadoClienteId}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 transition-colors">
                  {payLoading ? 'Lançando...' : '✓ Confirmar Fiado'}
                </button>
                <button onClick={() => setFiadoMode(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700/60 transition-colors">
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      {!showPayPick && (
        <div className="px-3 pb-3 flex gap-2 flex-wrap">
          {confirming === 'cancelled' ? (
            <div className="w-full space-y-2">
              <p className="text-xs text-red-400 font-semibold">Motivo do cancelamento:</p>
              <div className="grid grid-cols-2 gap-1">
                {['Cliente desistiu', 'Erro de lançamento', 'Produto indisponível', 'Duplicado'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setCancelReason(r)}
                    className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors text-left ${
                      cancelReason === r
                        ? 'bg-red-500/25 border-red-500/60 text-red-300'
                        : 'bg-gray-800 border-white/10 text-gray-400 hover:border-red-500/40 hover:text-red-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={confirmAction}
                  disabled={!cancelReason}
                  className="btn-red flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => { setConfirming(null); setCancelReason(''); }}
                  className="btn-ghost flex-1"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : confirming ? (
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

      {/* ── Atribuir motoboy (delivery + ready) ─────────────── */}
      {order.status === 'ready' && order.deliveryType === 'delivery' && onAssign && (
        <div className="px-3 pb-3 border-t border-white/[0.06] pt-2">
          {!showDriverPick ? (
            <button
              disabled={assigning}
              onClick={() => setShowDriverPick(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-semibold transition-colors border border-blue-500/30 disabled:opacity-50"
            >
              {assigning ? '🛵 Atribuindo...' : (
                <>
                  🛵 Atribuir Motoboy
                  {availableDrivers.length > 0 && (
                    <span className="bg-blue-500 text-white text-[10px] px-1.5 rounded-full">
                      {availableDrivers.length}
                    </span>
                  )}
                </>
              )}
            </button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                Escolher motoboy:
              </p>
              {availableDrivers.length === 0 ? (
                <p className="text-xs text-gray-600 italic py-1">Nenhum motoboy disponível</p>
              ) : (
                availableDrivers.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleAssignDriver(d.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-700/60 hover:bg-blue-600/30 text-gray-200 text-xs font-medium transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${d.status === 'available' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                    <span className="flex-1 text-left truncate">{d.name}</span>
                    {d.phone && <span className="text-gray-500 text-[10px] shrink-0">{d.phone}</span>}
                  </button>
                ))
              )}
              <button
                onClick={() => setShowDriverPick(false)}
                className="w-full text-xs text-gray-600 hover:text-gray-400 py-1"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PIX QR Code modal ─────────────────────────────────── */}
      {showPixModal && (
        <PixQrModal
          order={order}
          onClose={() => setShowPixModal(false)}
          onPaid={() => setShowPixModal(false)}
        />
      )}
    </div>
  );
}
