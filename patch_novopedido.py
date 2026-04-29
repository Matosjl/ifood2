with open('frontend/src/components/NovoPedido.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# O NovoPedido já recebe itensEstoque e os usa. Precisamos garantir que o id do estoque seja preservado.
# Vamos também garantir que qtd seja preservada corretamente quando o item vem do estoque.

# Atualmente, o cardapio é: itensEstoque.length > 0 ? itensEstoque : MOCK_CARDAPIO
# E os itens do estoque têm: id, nome, categoria, quantidade, precoCusto, precoVenda, porKg, foto
# Mas no cardápio agrupado, usamos: id, name, description, category, salePrice

# Vamos mapear os campos do estoque para o formato do cardápio, preservando o id original.
old_cardapio = '''  const cardapio = itensEstoque.length > 0 ? itensEstoque : MOCK_CARDAPIO;'''
new_cardapio = '''  const cardapio = itensEstoque.length > 0
    ? itensEstoque.map(i => ({
        id: i.id,
        name: i.nome || i.name,
        description: i.description || "",
        category: i.categoria || i.category,
        salePrice: i.precoVenda || i.salePrice,
        costPrice: i.precoCusto || i.costPrice,
        stockId: i.id, // preserva ID do estoque para dedução
      }))
    : MOCK_CARDAPIO;'''
content = content.replace(old_cardapio, new_cardapio)

with open('frontend/src/components/NovoPedido.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('NovoPedido.jsx updated successfully')
