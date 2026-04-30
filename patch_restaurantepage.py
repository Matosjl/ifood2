with open('frontend/src/components/RestaurantePage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update handleNovoPedido to call backend stock deduction
old_diminuir = '''  // Diminui estoque ao criar pedido
  const diminuirEstoque = (itensPedido) => {
    setEstoqueItens(prev => prev.map(item => {
      const vendido = itensPedido.find(i => i.id === item.id || i.name === item.nome || i.name === item.name);
      if (!vendido) return item;
      const novaQtd = Math.max(0, (item.quantidade ?? item.stock ?? 0) - vendido.qtd);
      return { ...item, quantidade: novaQtd };
    }));
  };'''
new_diminuir = '''  // Diminui estoque ao criar pedido (local + backend)
  const diminuirEstoque = async (itensPedido) => {
    // Atualiza localmente
    setEstoqueItens(prev => prev.map(item => {
      const vendido = itensPedido.find(i => i.id === item.id || i.name === item.nome || i.name === item.name);
      if (!vendido) return item;
      const novaQtd = Math.max(0, (item.quantidade ?? item.stock ?? 0) - vendido.qtd);
      return { ...item, quantidade: novaQtd };
    }));
    // Persiste dedução no backend
    try {
      const deducoes = itensPedido
        .filter(i => i.stockId || i.id)
        .map(i => ({ itemId: i.stockId || i.id, qtd: i.qtd }));
      if (deducoes.length > 0) {
        await axios.post(`${API}/estoque/deduzir`, { restauranteId: id || "local", itens: deducoes });
      }
    } catch (err) {
      console.error("Erro ao deduzir estoque no backend:", err);
    }
  };'''
content = content.replace(old_diminuir, new_diminuir)

# 2. Update handleNovoPedido call to be async (since diminuirEstoque is now async)
old_handle = '''  const handleNovoPedido = (pedido) => {'''
new_handle = '''  const handleNovoPedido = async (pedido) => {'''
content = content.replace(old_handle, new_handle)

# 3. Call diminuirEstoque with await
old_call = '''    setOrders((prev) => [novo, ...prev]);
    diminuirEstoque(pedido.itens);'''
new_call = '''    setOrders((prev) => [novo, ...prev]);
    await diminuirEstoque(pedido.itens);'''
content = content.replace(old_call, new_call)

# 4. Add thermal print button in OrderModal - before the main action buttons
old_modal_actions = '''          {/* Botão principal de ação por status */}'''
new_modal_actions = '''          {/* Botão de impressão térmica */}
          <button
            onClick={() => {
              const printWindow = window.open("", "_blank", "width=320,height=600");
              if (printWindow) {
                const itensHtml = (order.itensCompletos || order.items.map(name => ({ name, qtd: 1 })))
                  .map(i => `<tr><td>${i.qtd}x</td><td>${i.name}</td><td align="right">R$ ${((i.salePrice || 0) * i.qtd).toFixed(2)}</td></tr>`)
                  .join("");
                const enderecoHtml = order.endereco
                  ? `<p>${order.endereco.rua}, ${order.endereco.numero}</p><p>${order.endereco.referencia || ""}</p>`
                  : "<p>RETIRADA NO BALCÃO</p>";
                printWindow.document.write(`
                  <html>
                  <head>
                    <title>Pedido ${order.id}</title>
                    <style>
                      @media print { body { margin: 0; } }
                      body { font-family: monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 8px; }
                      .center { text-align: center; }
                      .header { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
                      .footer { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
                      table { width: 100%; border-collapse: collapse; }
                      td { padding: 2px 0; }
                      .total { font-size: 14px; font-weight: bold; }
                      .hidden-print { display: none; }
                    </style>
                  </head>
                  <body>
                    <div class="center header">
                      <h3 style="margin:0">${restaurantName}</h3>
                      <p style="margin:4px 0">${new Date().toLocaleString("pt-BR")}</p>
                      <p style="margin:4px 0"><b>${order.id}</b> · ${order.status}</p>
                    </div>
                    <p><b>Cliente:</b> ${order.client}</p>
                    <p><b>Telefone:</b> ${order.telefone || "-"}</p>
                    <div style="margin:8px 0">
                      <b>Endereço:</b>
                      ${enderecoHtml}
                    </div>
                    <table>
                      <thead><tr><td>Qtd</td><td>Item</td><td align="right">Valor</td></tr></thead>
                      <tbody>${itensHtml}</tbody>
                    </table>
                    <div class="footer">
                      <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>R$ ${(order.total - (order.type === "ENTREGA" ? 5 : 0)).toFixed(2)}</span></div>
                      ${order.type === "ENTREGA" ? `<div style="display:flex;justify-content:space-between"><span>Taxa entrega:</span><span>R$ 5.00</span></div>` : ""}
                      <div style="display:flex;justify-content:space-between" class="total"><span>TOTAL:</span><span>R$ ${order.total.toFixed(2)}</span></div>
                      <p><b>Pagamento:</b> ${order.payment}</p>
                      ${order.observacao ? `<p><b>Obs:</b> ${order.observacao}</p>` : ""}
                    </div>
                    <div class="center" style="margin-top:16px">
                      <p>Obrigado pela preferência!</p>
                    </div>
                    <div style="text-align:center;margin-top:20px" class="hidden-print">
                      <button onclick="window.print()" style="padding:8px 16px;font-size:14px">🖨 IMPRIMIR</button>
                    </div>
                  </body>
                  </html>
                `);
                printWindow.document.close();
              }
            }}
            className="w-full py-2 font-mono text-xs border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors mb-2"
          >
            🖨 IMPRIMIR PEDIDO (TÉRMICA)
          </button>

          {/* Botão principal de ação por status */}'''
content = content.replace(old_modal_actions, new_modal_actions)

with open('frontend/src/components/RestaurantePage.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('RestaurantePage.jsx updated successfully')
