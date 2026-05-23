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

export function printOrder(order) {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}'); }
    catch { return {}; }
  })();

  const tenant = user.tenant?.name ?? 'Restaurante';
  const now    = new Date();
  const date   = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const time   = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const itemRows = (order.items ?? []).map((item) => {
    const qty  = item.weightKg ? `${item.weightKg}kg` : `${item.quantity}x`;
    const name = item.productName ?? item.product_name ?? '';
    const tot  = parseFloat(item.total ?? 0).toFixed(2);
    const note = item.notes
      ? `<br><span style="font-size:10px">&nbsp;&nbsp;↳ ${item.notes}</span>`
      : '';
    return `
      <tr>
        <td style="padding:3px 2px 3px 0;line-height:1.5;vertical-align:top">
          <b>${qty}</b> ${name}${note}
        </td>
        <td style="text-align:right;white-space:nowrap;padding:3px 0;vertical-align:top;font-weight:bold">
          ${tot}
        </td>
      </tr>`;
  }).join('');

  const troco      = extractTroco(order.notes);
  const cleanNotes = notesWithoutTroco(order.notes);

  const delivType   = order.deliveryType ?? order.delivery_type ?? '';
  const isDelivery  = delivType === 'delivery' ||
                      (parseFloat(order.deliveryFee ?? order.delivery_fee ?? 0) > 0);
  const neighborhood = order.neighborhood ?? null;
  const address     = order.customerAddress ?? order.customer_address ?? '';
  const payment     = PAYMENT_LABELS[order.paymentMethod ?? order.payment_method] ?? 'Dinheiro';
  const channel     = order.channel && order.channel !== 'manual'
    ? `<p class="center" style="font-size:10px;font-weight:bold;letter-spacing:1px">${order.channel.toUpperCase()}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Pedido #${order.orderNumber ?? order.order_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: bold;
      line-height: 1.5;
      width: 58mm;
      min-width: 58mm;
      max-width: 58mm;
      padding: 2mm 2mm 6mm 2mm;
      color: #000;
      background: #fff;
    }
    .center  { text-align:center; }
    hr       { border:none; border-top:1px dashed #000; margin:4px 0; }
    hr.solid { border-top:2px solid #000; }
    p        { margin-bottom:2px; font-weight:bold; }
    table    { width:100%; border-collapse:collapse; }

    .restaurante {
      font-size:13px;
      font-weight:900;
      text-align:center;
      letter-spacing:1px;
      text-transform:uppercase;
    }
    .num-pedido {
      font-size:22px;
      font-weight:900;
      letter-spacing:2px;
      text-align:center;
      line-height:1.2;
      margin:3px 0 1px;
    }
    .datetime {
      text-align:center;
      font-size:11px;
      font-weight:bold;
      margin-bottom:2px;
    }
    .cliente-box {
      border:2px solid #000;
      padding:3px 5px;
      margin:4px 0;
    }
    .cliente-nome {
      font-size:13px;
      font-weight:900;
      text-transform:uppercase;
    }
    .cliente-tel {
      font-size:11px;
      font-weight:bold;
      margin-top:1px;
    }
    .itens-titulo {
      font-size:11px;
      font-weight:900;
      letter-spacing:1px;
      text-transform:uppercase;
      margin-bottom:2px;
    }
    .total-row td {
      border-top:2px solid #000;
      padding-top:4px;
      font-weight:900;
      font-size:14px;
    }
    .troco {
      text-decoration:underline;
      font-weight:900;
      font-size:12px;
      margin:3px 0;
    }
    .tipo-label {
      font-size:12px;
      font-weight:900;
      text-transform:uppercase;
    }
    .endereco {
      font-size:11px;
      font-weight:bold;
      margin-top:1px;
      line-height:1.4;
    }
    .obrigado {
      text-align:center;
      font-size:12px;
      font-weight:900;
      letter-spacing:0.5px;
      margin-top:5px;
    }

    @media print {
      @page {
        size: 58mm auto;
        margin: 0mm;
      }
      html, body {
        width: 58mm;
        min-width: 58mm;
        max-width: 58mm;
        padding: 1mm 2mm 4mm 2mm;
      }
    }
  </style>
</head>
<body>

  <p class="restaurante">${tenant}</p>
  ${channel}
  <hr class="solid">

  <p class="num-pedido">#${order.orderNumber ?? order.order_number}</p>
  <p class="datetime">${date} · ${time}</p>

  <hr>

  ${order.customerName ? `
  <div class="cliente-box">
    <p class="cliente-nome">${order.customerName}</p>
    ${order.customerPhone ? `<p class="cliente-tel">📞 ${order.customerPhone}</p>` : ''}
  </div>` : ''}

  <p class="itens-titulo">── Itens ──</p>
  <table>
    ${itemRows}
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">R$ ${parseFloat(order.total ?? 0).toFixed(2)}</td>
    </tr>
  </table>

  ${troco ? `<hr><p class="troco">💵 ${troco.replace(/troco\s+para/i,'Troco p/')}</p>` : ''}
  ${cleanNotes ? `<hr><p style="font-size:10px"><b>Obs:</b> ${cleanNotes}</p>` : ''}

  <hr>

  <p class="tipo-label">${isDelivery ? '🛵 Entrega' : '🏪 Retirada'}</p>
  ${isDelivery && neighborhood ? `<p class="endereco" style="font-size:12px;font-weight:900">📌 ${neighborhood}</p>` : ''}
  ${isDelivery && address      ? `<p class="endereco">📍 ${address}</p>` : ''}
  ${isDelivery && parseFloat(order.deliveryFee ?? order.delivery_fee ?? 0) > 0
    ? `<p style="font-size:10px;font-weight:bold;margin-top:1px">Taxa: R$ ${parseFloat(order.deliveryFee ?? order.delivery_fee).toFixed(2)}</p>`
    : ''}
  <p style="margin-top:3px;font-size:11px">💳 ${payment}</p>

  <hr class="solid">
  <p class="obrigado">Obrigado! 😊</p>

</body></html>`;

  // ── Impressão via window.open ────────────────────────────────
  const w = window.open('', '_blank', 'width=300,height=700,toolbar=0,scrollbars=1,status=0,menubar=0');

  if (!w) {
    // Popup bloqueado — fallback: baixa como arquivo HTML
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pedido-${order.orderNumber ?? order.order_number}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return false;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  // FIX: usa afterprint para fechar SOMENTE após o dialog ser dispensado.
  // Evita double-print (onload + fallback setTimeout) e evita fechar
  // a janela no meio da impressão com timer fixo.
  let printed = false;

  const doPrint = () => {
    if (printed) return;   // guarda: nunca imprime duas vezes
    printed = true;

    // Fecha a janela quando o usuário dispensar o dialog (imprimir ou cancelar)
    w.addEventListener('afterprint', () => {
      try { w.close(); } catch (e) { /* já fechada */ }
    });

    w.focus();
    w.print();
  };

  // Dispara via onload (caminho normal)
  w.onload = () => setTimeout(doPrint, 250);

  // Fallback para browsers que não disparam onload em document.write
  setTimeout(() => { if (!w.closed) doPrint(); }, 900);

  return true;
}

// ── Comanda de cozinha — 80mm ─────────────────────────────────
export function printKitchen(order) {
  const now  = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const itemRows = (order.items ?? []).map((item) => {
    const qty  = item.weightKg ? `${item.weightKg}kg` : `${item.quantity}×`;
    const name = item.productName ?? item.product_name ?? '';
    const note = item.notes
      ? `<div class="item-obs">↳ ${item.notes}</div>`
      : '';
    return `
      <div class="item">
        <span class="item-qty">${qty}</span>
        <span class="item-name">${name}</span>
        ${note}
      </div>`;
  }).join('');

  const delivType  = order.deliveryType ?? order.delivery_type ?? '';
  const isDelivery = delivType === 'delivery' ||
                     (parseFloat(order.deliveryFee ?? order.delivery_fee ?? 0) > 0);
  const tipoLabel  = isDelivery ? '🛵 ENTREGA' : '🏪 RETIRADA';

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Comanda #${order.orderNumber ?? order.order_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-weight: bold;
      width: 80mm;
      min-width: 80mm;
      max-width: 80mm;
      padding: 3mm 3mm 8mm 3mm;
      color: #000;
      background: #fff;
    }
    .header-label {
      text-align: center;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      font-weight: 900;
      border: 2px solid #000;
      padding: 2px 0;
      margin-bottom: 4px;
    }
    .num {
      text-align: center;
      font-size: 52px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -1px;
      margin: 2px 0;
    }
    .hora {
      text-align: center;
      font-size: 14px;
      font-weight: 900;
      margin-bottom: 4px;
    }
    .tipo {
      text-align: center;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    hr { border: none; border-top: 2px dashed #000; margin: 4px 0; }
    hr.solid { border-top: 3px solid #000; }
    .item {
      padding: 5px 0;
      border-bottom: 1px dashed #ccc;
      line-height: 1.3;
    }
    .item:last-child { border-bottom: none; }
    .item-qty {
      display: inline-block;
      font-size: 22px;
      font-weight: 900;
      min-width: 36px;
      vertical-align: top;
    }
    .item-name {
      display: inline-block;
      font-size: 18px;
      font-weight: 900;
      vertical-align: top;
      line-height: 1.3;
      max-width: 62mm;
    }
    .item-obs {
      font-size: 13px;
      font-weight: 900;
      padding-left: 36px;
      margin-top: 2px;
      text-decoration: underline;
    }
    .obs-pedido {
      font-size: 13px;
      font-weight: 900;
      border: 2px solid #000;
      padding: 3px 5px;
      margin-top: 4px;
    }
    @media print {
      @page { size: 80mm auto; margin: 0mm; }
      html, body {
        width: 80mm;
        min-width: 80mm;
        max-width: 80mm;
        padding: 2mm 3mm 6mm 3mm;
      }
    }
  </style>
</head>
<body>

  <div class="header-label">⭐ COZINHA ⭐</div>
  <p class="num">#${order.orderNumber ?? order.order_number}</p>
  <p class="hora">${time}</p>
  <p class="tipo">${tipoLabel}</p>
  <hr class="solid">

  <div class="itens">${itemRows}</div>

  ${order.notes ? `<div class="obs-pedido">⚠️ OBS: ${order.notes}</div>` : ''}

</body></html>`;

  const w = window.open('', '_blank', 'width=380,height=700,toolbar=0,scrollbars=1,status=0,menubar=0');

  if (!w) {
    // Popup bloqueado — fallback arquivo HTML
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `comanda-${order.orderNumber ?? order.order_number}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return false;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    w.addEventListener('afterprint', () => { try { w.close(); } catch (e) { /* já fechada */ } });
    w.focus();
    w.print();
  };

  w.onload = () => setTimeout(doPrint, 250);
  setTimeout(() => { if (!w.closed) doPrint(); }, 900);

  return true;
}
