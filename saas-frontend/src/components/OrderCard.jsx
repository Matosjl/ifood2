import { useState, useEffect } from 'react';

// ── Status config ─────────────────────────────────────────────

const STATUS = {
  pending:   { label: 'Pendente',   border: 'border-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300' },
  confirmed: { label: 'Confirmado', border: 'border-yellow-400', badge: 'bg-yellow-400/20 text-yellow-200' },
  preparing: { label: 'Em Preparo', border: 'border-blue-500',   badge: 'bg-blue-500/20   text-blue-300'   },
  ready:     { label: 'Pronto',     border: 'border-green-400',  badge: 'bg-green-400/20  text-green-300'  },
  delivered: { label: 'Entregue',   border: 'border-green-600',  badge: 'bg-green-600/20  text-green-400'  },
  cancelled: { label: 'Cancelado',  border: 'border-red-500',    badge: 'bg-red-500/20    text-red-300'    },
};

const ACTIONS = {
  pending:   [{ label: 'Iniciar Preparo', status: 'preparing', cls: 'btn-blue'  },
              { label: 'Cancelar',        status: 'cancelled', cls: 'btn-red', confirm: true }],
  confirmed: [{ label: 'Iniciar Preparo', status: 'preparing', cls: 'btn-blue'  },
              { label: 'Cancelar',        status: 'cancelled', cls: 'btn-red', confirm: true }],
  preparing: [{ label: 'Pronto!',         status: 'ready',     cls: 'btn-green' },
              { label: 'Cancelar',        status: 'cancelled', cls: 'btn-red', confirm: true }],
  ready:     [{ label: 'Entregar',        status: 'delivered', cls: 'btn-green' }],
  delivered: [],
  cancelled: [],
};

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

// ── Print receipt ─────────────────────────────────────────────

function printOrder(order) {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}'); }
    catch { return {}; }
  })();
  const tenant = user.tenant?.name ?? 'Restaurante';
  const now    = new Date();
  const date   = now.toLocaleDateString('pt-BR');
  const time   = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const itemRows = (order.items ?? []).map((item) => {
    const qty = item.weightKg ? `${item.weightKg}kg` : `${item.quantity}x`;
    return `
      <tr>
        <td style="padding:2px 4px 2px 0">${qty} ${item.productName}</td>
        <td style="text-align:right;white-space:nowrap">R$ ${parseFloat(item.total).toFixed(2)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Pedido #${order.orderNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',monospace; font-size:12px; width:80mm; padding:5mm 4mm; }
    .c  { text-align:center; }
    .b  { font-weight:bold; }
    .lg { font-size:15px; }
    .xl { font-size:22px; letter-spacing:1px; }
    hr  { border:none; border-top:1px dashed #000; margin:5px 0; }
    table { width:100%; border-collapse:collapse; }
    td  { vertical-align:top; padding:2px 0; font-size:12px; }
    .total td { border-top:1px dashed #000; padding-top:5px; font-weight:bold; font-size:14px; }
    @media print { @page { size:80mm auto; margin:0; } }
  </style>
</head><body>
  <p class="c b lg">${tenant}</p>
  <hr>
  <p class="c xl b">PEDIDO #${order.orderNumber}</p>
  <p class="c">${date} ${time}</p>
  ${order.channel && order.channel !== 'manual' ? `<p class="c b">Canal: ${order.channel.toUpperCase()}</p>` : ''}
  <hr>
  ${order.customerName  ? `<p><b>Cliente:</b> ${order.customerName}</p>`  : ''}
  ${order.customerPhone ? `<p><b>Tel:</b> ${order.customerPhone}</p>`      : ''}
  ${(order.customerName || order.customerPhone) ? '<hr>' : ''}
  <p class="b" style="margin-bottom:3px">ITENS:</p>
  <table>
    ${itemRows}
    <tr class="total">
      <td>TOTAL</td>
      <td style="text-align:right">R$ ${parseFloat(order.total).toFixed(2)}</td>
    </tr>
  </table>
  ${order.notes ? `<hr><p><b>Obs:</b> ${order.notes}</p>` : ''}
  <hr>
  <p class="c" style="font-size:10px;margin-top:3px">Obrigado pela preferência!</p>
</body></html>`;

  const w = window.open('', '_blank', 'width=370,height=560');
  if (!w) {
    alert('Popup bloqueado. Permita pop-ups para imprimir pedidos.');
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); w.close(); }, 350);
}

// ── Card ──────────────────────────────────────────────────────

export default function OrderCard({ order, onStatusChange, onAcknowledge }) {
  const [isNew,      setIsNew]      = useState(true);
  const [confirming, setConfirming] = useState(null);
  const cfg = STATUS[order.status] ?? STATUS.pending;

  useEffect(() => {
    const t = setTimeout(() => setIsNew(false), 600);
    return () => clearTimeout(t);
  }, []);

  const handleAction = (action) => {
    onAcknowledge?.(order.id);
    if (action.confirm) setConfirming(action.status);
    else onStatusChange(order.id, action.status);
  };

  const confirmCancel = () => {
    onStatusChange(order.id, confirming);
    setConfirming(null);
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
          <span className="text-lg font-black text-white shrink-0">
            #{order.orderNumber}
          </span>
          {order.channel && order.channel !== 'manual' && (
            <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-medium">
              {order.channel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Timer createdAt={order.createdAt} />
          {/* Print button */}
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
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Customer */}
      {(order.customerName || order.customerPhone) && (
        <div className="px-3 pb-1">
          {order.customerName && (
            <p className="text-sm font-medium text-gray-200 truncate">{order.customerName}</p>
          )}
          {order.customerPhone && (
            <p className="text-xs text-gray-400">{order.customerPhone}</p>
          )}
        </div>
      )}

      {/* Items */}
      <ul className="px-3 py-1.5 space-y-0.5 border-t border-white/5">
        {(order.items ?? []).map((item, i) => (
          <li key={item.id ?? i} className="flex justify-between items-baseline gap-2">
            <span className="text-sm text-gray-300 truncate leading-5">
              {item.weightKg
                ? `${item.weightKg}kg`
                : `${item.quantity}×`} {item.productName}
            </span>
            <span className="text-xs text-gray-500 shrink-0">
              R$ {parseFloat(item.total).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="px-3 pt-1.5 pb-2 flex items-center justify-between border-t border-white/5">
        <span className="text-base font-black text-white">
          R$ {parseFloat(order.total).toFixed(2)}
        </span>
        {order.notes && (
          <span className="text-xs text-amber-400/80 italic truncate max-w-[140px]" title={order.notes}>
            💬 {order.notes}
          </span>
        )}
      </div>

      {/* Actions */}
      {ACTIONS[order.status]?.length > 0 && (
        <div className="px-3 pb-3 flex gap-2 flex-wrap">
          {confirming ? (
            <>
              <span className="text-xs text-red-400 self-center">Confirmar cancelamento?</span>
              <button onClick={confirmCancel}           className="btn-red   flex-1">Sim</button>
              <button onClick={() => setConfirming(null)} className="btn-ghost flex-1">Não</button>
            </>
          ) : (
            ACTIONS[order.status].map((a) => (
              <button
                key={a.status}
                onClick={() => handleAction(a)}
                className={`${a.cls} flex-1 min-w-0`}
              >
                {a.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
