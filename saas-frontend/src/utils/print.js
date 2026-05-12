// ── Thermal receipt printer (80mm / 8cm) ─────────────────────

const PAYMENT_LABELS = {
  cash:    'Dinheiro',
  pix:     'Pix',
  credit:  'Cartão de Crédito',
  debit:   'Cartão de Débito',
  voucher: 'Vale Refeição',
  other:   'Outro',
};

// Extrai linha de troco das observações (ex: "Troco para R$ 50,00")
function extractTroco(notes) {
  if (!notes) return null;
  const match = notes.match(/troco\s+para[:\s]+R?\$?\s*[\d.,]+/i);
  return match ? match[0] : null;
}

// Remove a linha de troco das obs para não duplicar
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
  const time   = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Items
  const itemRows = (order.items ?? []).map((item) => {
    const qty  = item.weightKg ? `${item.weightKg}kg` : `${item.quantity}x`;
    const name = item.productName ?? item.product_name ?? '';
    const tot  = parseFloat(item.total ?? 0).toFixed(2);
    const note = item.notes ? `<br><span style="font-size:11px;color:#555">↳ ${item.notes}</span>` : '';
    return `
      <tr>
        <td style="padding:5px 4px 5px 0;line-height:1.6;vertical-align:top">
          <b>${qty}</b> ${name}${note}
        </td>
        <td style="text-align:right;white-space:nowrap;padding:5px 0;vertical-align:top;font-weight:bold">
          R$&nbsp;${tot}
        </td>
      </tr>`;
  }).join('');

  // Troco
  const troco       = extractTroco(order.notes);
  const cleanNotes  = notesWithoutTroco(order.notes);

  // Delivery info
  const isDelivery  = order.deliveryType === 'delivery' || order.delivery_type === 'delivery';
  const address     = order.customerAddress ?? order.customer_address ?? '';
  const payment     = PAYMENT_LABELS[order.paymentMethod ?? order.payment_method] ?? 'Dinheiro';
  const channel     = order.channel && order.channel !== 'manual'
    ? `<p style="font-size:12px;font-weight:bold;letter-spacing:1px">${order.channel.toUpperCase()}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Pedido #${order.orderNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      font-weight: bold;
      line-height: 1.6;
      width: 80mm;
      min-width: 80mm;
      padding: 4mm 4mm 8mm 4mm;
      color: #000;
    }
    .center  { text-align: center; }
    hr       { border: none; border-top: 2px dashed #000; margin: 7px 0; }
    hr.solid { border-top: 3px solid #000; }
    p        { margin-bottom: 3px; font-weight: bold; }
    table    { width: 100%; border-collapse: collapse; }

    /* Número do pedido — destaque máximo */
    .num-pedido {
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 3px;
      text-align: center;
      line-height: 1.2;
      margin: 4px 0 2px;
    }
    /* Data/hora */
    .datetime {
      text-align: center;
      font-size: 13px;
      font-weight: bold;
      color: #000;
      margin-bottom: 2px;
    }
    /* Nome do cliente — caixa destacada */
    .cliente-box {
      border: 2px solid #000;
      border-radius: 2px;
      padding: 5px 8px;
      margin: 6px 0;
      background: #f5f5f5;
    }
    .cliente-nome {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .cliente-tel {
      font-size: 13px;
      font-weight: bold;
      color: #000;
      margin-top: 1px;
    }
    /* Cabeçalho dos itens */
    .itens-titulo {
      font-weight: 900;
      font-size: 13px;
      letter-spacing: 1px;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    /* Linha do total */
    .total-row td {
      border-top: 3px solid #000;
      padding-top: 6px;
      font-weight: 900;
      font-size: 17px;
    }
    /* Troco — sublinhado */
    .troco {
      text-decoration: underline;
      font-weight: 900;
      font-size: 15px;
      margin: 4px 0;
    }
    /* Tipo entrega/retirada */
    .tipo-label {
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .endereco {
      font-size: 13px;
      font-weight: bold;
      margin-top: 2px;
      line-height: 1.5;
    }
    /* Rodapé */
    .obrigado {
      text-align: center;
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.5px;
      margin-top: 8px;
      padding-top: 4px;
    }
    /* Restaurante */
    .restaurante {
      font-size: 16px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    @media print {
      @page { size: 80mm auto; margin: 0; }
      body  { padding: 2mm 3mm 6mm 3mm; }
    }
  </style>
</head>
<body>

  <!-- Nome do restaurante -->
  <p class="restaurante">${tenant}</p>
  ${channel}
  <hr class="solid">

  <!-- Número do pedido + data -->
  <p class="num-pedido">PEDIDO #${order.orderNumber}</p>
  <p class="datetime">${date} &nbsp;·&nbsp; ${time}</p>

  <hr>

  <!-- Cliente -->
  ${order.customerName ? `
  <div class="cliente-box">
    <p class="cliente-nome">${order.customerName}</p>
    ${order.customerPhone ? `<p class="cliente-tel">📞 ${order.customerPhone}</p>` : ''}
  </div>` : ''}

  <!-- Itens -->
  <p class="itens-titulo">─── Itens ───</p>
  <table>
    ${itemRows}
    <tr class="total-row">
      <td style="padding-top:6px">TOTAL</td>
      <td style="text-align:right;padding-top:6px">R$&nbsp;${parseFloat(order.total ?? 0).toFixed(2)}</td>
    </tr>
  </table>

  <!-- Troco -->
  ${troco ? `<hr><p class="troco">💵 ${troco.replace(/troco\s+para/i,'Troco para')}</p>` : ''}

  <!-- Observações (sem o troco) -->
  ${cleanNotes ? `<hr><p style="font-size:12px"><b>Obs:</b> ${cleanNotes}</p>` : ''}

  <hr>

  <!-- Tipo + endereço + pagamento -->
  <p class="tipo-label">${isDelivery ? '🛵 Entrega' : '🏪 Retirada no Local'}</p>
  ${isDelivery && address ? `<p class="endereco">📍 ${address}</p>` : ''}
  <p style="margin-top:4px;font-size:12px">💳 ${payment}</p>

  <hr class="solid">

  <!-- Rodapé -->
  <p class="obrigado">Obrigado pela preferência!</p>

</body></html>`;

  // ── Impressão via iframe oculto ───────────────────────────
  // Evita popup/aba nova — o diálogo do sistema ainda aparece
  // mas sem abrir uma nova aba no navegador.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:80mm;height:1px;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  let printed = false; // guard: evita dupla impressão (onload + setTimeout)

  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.warn('[print] erro:', e);
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 3_000);
  };

  // Aguarda renderização antes de imprimir
  iframe.onload = () => doPrint();

  // Fallback: se onload não disparar (alguns browsers — ex: Firefox em modo quirks)
  setTimeout(doPrint, 700);

  return true;
}
