// ── Thermal receipt printer (80mm) ───────────────────────────

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
        <td style="padding:2px 4px 2px 0">${qty} ${item.productName}</td>
        <td style="text-align:right;white-space:nowrap">R$ ${parseFloat(item.total ?? 0).toFixed(2)}</td>
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
      <td style="text-align:right">R$ ${parseFloat(order.total ?? 0).toFixed(2)}</td>
    </tr>
  </table>
  ${order.notes ? `<hr><p><b>Obs:</b> ${order.notes}</p>` : ''}
  <hr>
  <p class="c" style="font-size:10px;margin-top:3px">Obrigado pela preferência!</p>
</body></html>`;

  const w = window.open('', '_blank', 'width=370,height=560');
  if (!w) {
    // popup bloqueado — silencioso (não interrompe o fluxo no auto-print)
    return false;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); w.close(); }, 350);
  return true;
}
