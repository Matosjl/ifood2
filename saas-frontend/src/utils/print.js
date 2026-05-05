// ── Thermal receipt printer (80mm) ───────────────────────────

const PAYMENT_LABELS = {
  cash:    'Dinheiro',
  pix:     'Pix',
  credit:  'Cartão de Crédito',
  debit:   'Cartão de Débito',
  voucher: 'Vale Refeição',
  other:   'Outro',
};

export function printOrder(order) {
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
        <td style="padding:5px 6px 5px 0;line-height:1.5">${qty} ${item.productName}</td>
        <td style="text-align:right;white-space:nowrap;padding:5px 0;line-height:1.5">R$ ${parseFloat(item.total ?? 0).toFixed(2)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Pedido #${order.orderNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',monospace; font-size:13px; line-height:1.6; width:80mm; padding:6mm 5mm; }
    .c  { text-align:center; }
    .b  { font-weight:bold; }
    .lg { font-size:16px; }
    .xl { font-size:24px; letter-spacing:2px; }
    p   { margin-bottom:4px; }
    hr  { border:none; border-top:1px dashed #000; margin:8px 0; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    td  { vertical-align:top; font-size:13px; line-height:1.6; }
    .total td { border-top:1px dashed #000; padding-top:8px; margin-top:4px; font-weight:bold; font-size:15px; }
    .section { margin-bottom:6px; }
    @media print { @page { size:80mm auto; margin:0; } }
  </style>
</head><body>
  <div class="section c">
    <p class="b lg">${tenant}</p>
  </div>
  <hr>
  <div class="section c">
    <p class="xl b">PEDIDO #${order.orderNumber}</p>
    <p>${date} &nbsp; ${time}</p>
    ${order.channel && order.channel !== 'manual' ? `<p class="b">Canal: ${order.channel.toUpperCase()}</p>` : ''}
  </div>
  <hr>
  ${order.customerName || order.customerPhone ? `
  <div class="section">
    ${order.customerName  ? `<p><b>Cliente:</b> ${order.customerName}</p>`  : ''}
    ${order.customerPhone ? `<p><b>Tel:</b> ${order.customerPhone}</p>`      : ''}
  </div>
  <hr>` : ''}
  <div class="section">
    <p class="b" style="margin-bottom:6px">ITENS:</p>
    <table>
      ${itemRows}
      <tr class="total">
        <td style="padding-top:8px">TOTAL</td>
        <td style="text-align:right;padding-top:8px">R$ ${parseFloat(order.total ?? 0).toFixed(2)}</td>
      </tr>
    </table>
  </div>
  ${order.notes ? `<hr><div class="section"><p><b>Obs:</b> ${order.notes}</p></div>` : ''}
  <hr>
  <div class="section">
    <p><b>Tipo:</b> ${order.deliveryType === 'delivery' ? 'Entrega' : 'Retirada'}</p>
    ${order.customerAddress ? `<p><b>Endereço:</b> ${order.customerAddress}</p>` : ''}
    <p><b>Pgto:</b> ${PAYMENT_LABELS[order.paymentMethod ?? order.payment_method] ?? (order.paymentMethod ?? order.payment_method ?? 'Dinheiro')}</p>
  </div>
  <hr>
  <p class="c" style="font-size:11px;margin-top:6px">Obrigado pela preferência!</p>
</body></html>`;

  // Usa iframe invisível — não precisa de permissão de popup e
  // funciona em impressão automática (sem gesto direto do usuário).
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.warn('[print] Falha ao imprimir:', e);
    }
    // Remove iframe após a caixa de diálogo fechar
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 2000);
  }, 400);

  return true;
}
