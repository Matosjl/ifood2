// ── Thermal printer utilities ────────────────────────────────
// printOrder   → recibo do cliente  (58mm)
// printKitchen → comanda de cozinha (80mm, texto grande)

const PAYMENT_LABELS = {
  cash:    'Dinheiro',
  pix:     'Pix',
  credit:  'Cartão Crédito',
  debit:   'Cartão Débito',
  card:    'Cartão',
  voucher: 'Vale Refeição',
  other:   'Outro',
};

function extractTroco(notes) {
  if (!notes) return null;
  const match = notes.match(/troco\s+para[:\s]+R?\$?\s*[\d.,]+/i);
  return match ? match[0] : null;
}

function notesWithoutTroco(notes) {
  if (!notes) return '';
  return notes.replace(/[\n\r]?troco\s+para[:\s]+R?\$?\s*[\d.,]+/gi, '').trim();
}

function openPrint(html, width = 300) {
  const blob    = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const w       = window.open(blobUrl, '_blank',
    `width=${width},height=700,toolbar=0,scrollbars=1,status=0,menubar=0`);

  if (!w) {
    URL.revokeObjectURL(blobUrl);
    alert('Impressão bloqueada pelo navegador.\nPermita popups para este site nas configurações do Chrome e tente novamente.');
    return false;
  }

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    w.addEventListener('afterprint', () => {
      try { w.close(); } catch (_) { /* já fechada */ }
      URL.revokeObjectURL(blobUrl);
    });
    w.focus();
    w.print();
  };

  w.onload = () => setTimeout(doPrint, 250);
  setTimeout(() => { if (!w.closed) doPrint(); }, 900);
  return true;
}

// ── Recibo do cliente — 58mm ──────────────────────────────────
export function printOrder(order) {
  // Login salva user e tenant em chaves separadas no localStorage
  const tenant = (() => {
    try {
      const t = JSON.parse(localStorage.getItem('tenant') ?? 'null');
      if (t?.name) return t.name;
      const u = JSON.parse(localStorage.getItem('user')   ?? '{}');
      return u.tenant?.name ?? 'Restaurante';
    } catch { return 'Restaurante'; }
  })();
  const now    = new Date();
  const date   = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time   = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const troco      = extractTroco(order.notes);
  const cleanNotes = notesWithoutTroco(order.notes);
  const delivType  = order.deliveryType ?? order.delivery_type ?? '';
  const isDelivery = delivType === 'delivery' ||
                     (parseFloat(order.deliveryFee ?? order.delivery_fee ?? 0) > 0);
  const neighborhood = order.neighborhood ?? null;
  const address      = order.customerAddress ?? order.customer_address ?? '';
  const payment      = PAYMENT_LABELS[order.paymentMethod ?? order.payment_method] ?? 'Dinheiro';
  const deliveryFee  = parseFloat(order.deliveryFee ?? order.delivery_fee ?? 0);
  const channel      = order.channel && order.channel !== 'manual'
    ? `<div class="channel">${order.channel.toUpperCase()}</div>` : '';

  const itemRows = (order.items ?? []).map((item) => {
    const qty  = item.weightKg ? `${item.weightKg}kg` : `${item.quantity}x`;
    const name = item.productName ?? item.product_name ?? '';
    const tot  = `R$ ${parseFloat(item.total ?? 0).toFixed(2)}`;
    const note = item.notes
      ? `<div class="item-obs">↳ ${item.notes}</div>` : '';

    // Choices do combo (ex: sabor escolhido, tipo de carne)
    const choiceRows = (item.choices ?? []).map(c => {
      const cName  = c.productName ?? c.product_name ?? '';
      const cExtra = parseFloat(c.extraPrice ?? c.extra_price ?? 0);
      const cPrice = cExtra > 0 ? ` +R$ ${cExtra.toFixed(2)}` : '';
      return `<div class="item-sub">↳ ${cName}${cPrice}</div>`;
    }).join('');

    // Addons / complementos (ex: batata extra, cheddar, bebida)
    const addonRows = (item.addons ?? []).map(a => {
      const aName = a.addonName ?? a.addon_name ?? '';
      const aQty  = (a.qty ?? 1) > 1 ? `${a.qty}x ` : '';
      const aTot  = parseFloat(a.total ?? 0) > 0
        ? ` R$ ${parseFloat(a.total).toFixed(2)}` : '';
      return `<div class="item-sub">+ ${aQty}${aName}${aTot}</div>`;
    }).join('');

    return `
      <div class="item-row">
        <div class="item-main">
          <span class="item-qty">${qty}</span>
          <span class="item-name">${name}</span>
          <span class="item-price">${tot}</span>
        </div>
        ${note}
        ${choiceRows}
        ${addonRows}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Pedido #${order.orderNumber ?? order.order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: bold;
      width: 58mm;
      min-width: 58mm;
      max-width: 58mm;
      padding: 3mm 2mm 8mm 2mm;
      color: #000;
      background: #fff;
    }
    /* ── Utilitários ── */
    .center   { text-align: center; }
    .hr-solid { border: none; border-top: 2px solid #000; margin: 5px 0; }
    .hr-dash  { border: none; border-top: 1px dashed #000; margin: 4px 0; }

    /* ── Cabeçalho ── */
    .restaurante {
      font-size: 15px;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1px;
      line-height: 1.2;
      margin-bottom: 2px;
    }
    .channel {
      text-align: center;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 2px;
      border: 1px solid #000;
      padding: 1px 4px;
      margin: 3px auto;
      display: inline-block;
      width: 100%;
    }
    .num-pedido {
      font-size: 28px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 3px;
      border: 2px solid #000;
      padding: 4px 0;
      margin: 5px 0 3px;
      line-height: 1.1;
    }
    .datetime {
      text-align: center;
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 4px;
    }

    /* ── Cliente ── */
    .cliente-box {
      border: 2px solid #000;
      padding: 4px 6px;
      margin: 4px 0;
    }
    .cliente-nome {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .cliente-tel {
      font-size: 11px;
      font-weight: bold;
      margin-top: 2px;
    }

    /* ── Itens ── */
    .itens-titulo {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-align: center;
      margin: 4px 0 3px;
    }
    .item-row {
      margin-bottom: 4px;
      padding-bottom: 3px;
      border-bottom: 1px dashed #ccc;
    }
    .item-row:last-of-type { border-bottom: none; }
    /* display:table é mais robusto que flex em drivers de impressora térmica */
    .item-main {
      display: table;
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    .item-qty {
      display: table-cell;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
      vertical-align: top;
      padding-right: 3px;
      width: 1%;
    }
    .item-name {
      display: table-cell;
      font-size: 12px;
      font-weight: bold;
      line-height: 1.3;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .item-price {
      display: table-cell;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
      vertical-align: top;
      text-align: right;
      padding-left: 4px;
      width: 1%;
    }
    .item-obs {
      font-size: 10px;
      font-weight: bold;
      padding-left: 20px;
      margin-top: 1px;
      font-style: italic;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .item-sub {
      font-size: 10px;
      font-weight: bold;
      padding-left: 20px;
      margin-top: 1px;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* ── Total ── */
    .total-box {
      border-top: 2px solid #000;
      margin-top: 5px;
      padding-top: 5px;
    }
    .total-row {
      display: table;
      width: 100%;
      font-size: 16px;
      font-weight: 900;
    }
    .total-row span { display: table-cell; }
    .total-row span:last-child { text-align: right; white-space: nowrap; }
    .taxa-row {
      display: table;
      width: 100%;
      font-size: 11px;
      font-weight: bold;
      margin-top: 2px;
    }
    .taxa-row span { display: table-cell; }
    .taxa-row span:last-child { text-align: right; white-space: nowrap; }
    .troco {
      font-size: 12px;
      font-weight: 900;
      text-decoration: underline;
      margin-top: 4px;
    }

    /* ── Rodapé ── */
    .tipo-box {
      border: 2px solid #000;
      padding: 4px 6px;
      margin: 5px 0 3px;
    }
    .tipo-label {
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .endereco {
      font-size: 11px;
      font-weight: bold;
      margin-top: 2px;
      line-height: 1.4;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .pagamento {
      font-size: 12px;
      font-weight: bold;
      margin: 3px 0;
    }
    .obs-box {
      border: 1px dashed #000;
      padding: 3px 5px;
      margin: 4px 0;
      font-size: 11px;
      font-weight: bold;
    }
    .obrigado {
      text-align: center;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 1px;
      margin-top: 6px;
    }

    @media print {
      @page { size: 58mm auto; margin: 0mm; }
      html, body {
        width: 58mm;
        min-width: 58mm;
        max-width: 58mm;
        padding: 1mm 2mm 5mm 2mm;
      }
    }
  </style>
</head>
<body>

  <p class="restaurante">${tenant}</p>
  ${channel}
  <div class="hr-solid"></div>

  <div class="num-pedido center">#${order.orderNumber ?? order.order_number}</div>
  <p class="datetime">${date} - ${time}</p>

  <div class="hr-dash"></div>

  ${order.customerName ? `
  <div class="cliente-box">
    <p class="cliente-nome">${order.customerName}</p>
    ${order.customerPhone ? `<p class="cliente-tel">Tel: ${order.customerPhone}</p>` : ''}
  </div>` : ''}

  <p class="itens-titulo">── Itens ──</p>

  <div class="itens">
    ${itemRows}
  </div>

  <div class="total-box">
    ${deliveryFee > 0 ? `<div class="taxa-row"><span>Taxa de entrega</span><span>R$ ${deliveryFee.toFixed(2)}</span></div>` : ''}
    <div class="total-row">
      <span>TOTAL</span>
      <span>R$ ${parseFloat(order.total ?? 0).toFixed(2)}</span>
    </div>
  </div>

  ${troco ? `<p class="troco">Troco p/ ${troco.replace(/troco\s+para[:\s]*/i, '')}</p>` : ''}

  ${cleanNotes ? `<div class="obs-box"><b>Obs:</b> ${cleanNotes}</div>` : ''}

  <div class="hr-solid"></div>

  <div class="tipo-box">
    <p class="tipo-label">${isDelivery ? 'Entrega' : 'Retirada'}</p>
    ${isDelivery && neighborhood ? `<p class="endereco">Bairro: ${neighborhood}</p>` : ''}
    ${isDelivery && address      ? `<p class="endereco">${address}</p>` : ''}
  </div>

  <p class="pagamento">Pagamento: ${payment}</p>

  <div class="hr-solid"></div>
  <p class="obrigado">Obrigado pela preferencia!</p>

</body></html>`;

  return openPrint(html, 300);
}

// ── Comanda de cozinha — 58mm ou 80mm (lê localStorage) ──────
// Configurável em Configurações → Impressora → Largura da comanda
// Valores: '58' (padrão) ou '80'
export function printKitchen(order, target = null) {
  const now  = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const allItems = order.items ?? [];
  const items = target == null ? allItems : allItems.filter((item) => {
    const t = item.printerTarget ?? item.printer_target ?? 'kitchen';
    return t === target || t === 'both';
  });

  if (items.length === 0) return false;

  // Lê largura configurada pelo restaurante (default: 58mm)
  const paperWidth = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('printerSettings') ?? '{}');
      return s.kitchenWidth === '80' ? 80 : 58;
    } catch { return 58; }
  })();

  const is80 = paperWidth === 80;

  // Escalas de fonte por largura
  const f = is80
    ? { dest: 16, num: 64, hora: 16, tipo: 18, cliente: 14, qty: 28, name: 22, obs: 14, obsQtyPad: 54, obsPedido: 15, obsLabel: 11 }
    : { dest: 13, num: 40, hora: 13, tipo: 14, cliente: 12, qty: 20, name: 16, obs: 11, obsQtyPad: 38, obsPedido: 12, obsLabel: 10 };

  const mm      = paperWidth;
  const popupW  = is80 ? 380 : 300;

  const targetLabel = target === 'bar' ? 'BAR' : 'COZINHA';
  const targetIcon  = target === 'bar' ? '🍺' : '⭐';

  const delivType  = order.deliveryType ?? order.delivery_type ?? '';
  const isDelivery = delivType === 'delivery' ||
                     (parseFloat(order.deliveryFee ?? order.delivery_fee ?? 0) > 0);
  const tipoLabel  = isDelivery ? 'ENTREGA' : 'RETIRADA';

  const itemRows = items.map((item) => {
    const qty  = item.weightKg ? `${item.weightKg}kg` : `${item.quantity}`;
    const name = item.productName ?? item.product_name ?? '';
    const note = item.notes
      ? `<div class="item-obs">↳ ${item.notes}</div>` : '';

    // Choices do combo — cozinha precisa saber o sabor/tipo escolhido
    const choiceRows = (item.choices ?? []).map(c => {
      const cName = c.productName ?? c.product_name ?? '';
      return `<div class="item-choice">↳ ${cName}</div>`;
    }).join('');

    // Addons / complementos — cozinha/bar precisa preparar
    const addonRows = (item.addons ?? []).map(a => {
      const aName = a.addonName ?? a.addon_name ?? '';
      const aQty  = (a.qty ?? 1) > 1 ? `${a.qty}x ` : '';
      return `<div class="item-addon-k">+ ${aQty}${aName}</div>`;
    }).join('');

    return `
      <div class="item">
        <div class="item-main">
          <span class="item-qty">${qty}x</span>
          <span class="item-name">${name}</span>
        </div>
        ${note}
        ${choiceRows}
        ${addonRows}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Comanda #${order.orderNumber ?? order.order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-weight: bold;
      width: ${mm}mm;
      min-width: ${mm}mm;
      max-width: ${mm}mm;
      padding: ${is80 ? '4mm 3mm 10mm 3mm' : '3mm 2mm 8mm 2mm'};
      color: #000;
      background: #fff;
    }

    /* ── Utilitários ── */
    .hr-solid { border: none; border-top: ${is80 ? 3 : 2}px solid #000; margin: ${is80 ? 6 : 4}px 0; }
    .hr-dash  { border: none; border-top: ${is80 ? 2 : 1}px dashed #000; margin: ${is80 ? 5 : 3}px 0; }

    /* ── Cabeçalho destino ── */
    .dest-box {
      border: ${is80 ? 3 : 2}px solid #000;
      padding: ${is80 ? 5 : 3}px 0;
      text-align: center;
      margin-bottom: ${is80 ? 5 : 3}px;
    }
    .dest-label {
      font-size: ${f.dest}px;
      font-weight: 900;
      letter-spacing: ${is80 ? 4 : 2}px;
      text-transform: uppercase;
    }

    /* ── Número do pedido ── */
    .num {
      text-align: center;
      font-size: ${f.num}px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -1px;
      margin: ${is80 ? 4 : 2}px 0;
    }

    /* ── Hora e tipo ── */
    .hora {
      text-align: center;
      font-size: ${f.hora}px;
      font-weight: 900;
      margin-bottom: ${is80 ? 3 : 2}px;
    }
    .tipo-box {
      border: ${is80 ? 2 : 1}px solid #000;
      padding: ${is80 ? 4 : 2}px 0;
      text-align: center;
      margin: ${is80 ? 4 : 3}px 0;
    }
    .tipo-label {
      font-size: ${f.tipo}px;
      font-weight: 900;
      letter-spacing: ${is80 ? 3 : 2}px;
    }

    /* ── Cliente ── */
    .cliente {
      font-size: ${f.cliente}px;
      font-weight: 900;
      text-transform: uppercase;
      text-align: center;
      margin: ${is80 ? 4 : 3}px 0;
    }

    /* ── Itens ── */
    .item {
      padding: ${is80 ? 8 : 5}px 0;
      border-bottom: ${is80 ? 2 : 1}px dashed #000;
    }
    .item:last-child { border-bottom: none; }
    .item-main {
      display: flex;
      align-items: flex-start;
      gap: ${is80 ? 6 : 4}px;
    }
    .item-qty {
      font-size: ${f.qty}px;
      font-weight: 900;
      line-height: 1;
      min-width: ${is80 ? 48 : 34}px;
      flex-shrink: 0;
    }
    .item-name {
      font-size: ${f.name}px;
      font-weight: 900;
      line-height: 1.2;
      flex: 1;
      padding-top: 2px;
    }
    .item-obs {
      font-size: ${f.obs}px;
      font-weight: 900;
      padding-left: ${f.obsQtyPad}px;
      margin-top: ${is80 ? 4 : 2}px;
      text-decoration: underline;
      font-style: italic;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    /* Choices do combo (sabor/tipo escolhido) */
    .item-choice {
      font-size: ${f.obs}px;
      font-weight: 900;
      padding-left: ${f.obsQtyPad}px;
      margin-top: ${is80 ? 3 : 2}px;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    /* Addons / complementos (batata, bebida, extra) */
    .item-addon-k {
      font-size: ${f.obs}px;
      font-weight: bold;
      padding-left: ${f.obsQtyPad}px;
      margin-top: ${is80 ? 2 : 1}px;
      font-style: italic;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* ── Observação do pedido ── */
    .obs-pedido {
      border: ${is80 ? 3 : 2}px solid #000;
      padding: ${is80 ? 5 : 3}px ${is80 ? 6 : 4}px;
      margin-top: ${is80 ? 6 : 4}px;
      font-size: ${f.obsPedido}px;
      font-weight: 900;
    }
    .obs-label {
      font-size: ${f.obsLabel}px;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: ${is80 ? 3 : 2}px;
    }

    @media print {
      @page { size: ${mm}mm auto; margin: 0mm; }
      html, body {
        width: ${mm}mm;
        min-width: ${mm}mm;
        max-width: ${mm}mm;
        padding: ${is80 ? '2mm 3mm 8mm 3mm' : '1mm 2mm 6mm 2mm'};
      }
    }
  </style>
</head>
<body>

  <div class="dest-box">
    <div class="dest-label">${targetIcon} ${targetLabel} ${targetIcon}</div>
  </div>

  <div class="num">#${order.orderNumber ?? order.order_number}</div>
  <p class="hora">${time}</p>

  <div class="tipo-box">
    <p class="tipo-label">${tipoLabel}</p>
  </div>

  ${order.customerName ? `<p class="cliente">${order.customerName}</p>` : ''}

  <div class="hr-solid"></div>

  <div class="itens">
    ${itemRows}
  </div>

  ${order.notes ? `
  <div class="obs-pedido">
    <div class="obs-label">⚠ Observacao</div>
    ${order.notes}
  </div>` : ''}

</body></html>`;

  return openPrint(html, popupW);
}
