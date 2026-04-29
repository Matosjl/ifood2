# TODO - Implementação Fase 1 (Novo Pedido + RestaurantePage)

- [x] Atualizar `frontend/src/components/NovoPedido.jsx`
  - [x] Busca de cliente por telefone/nome
  - [x] Cadastro de novo cliente (nome, cpf opcional, gmail, nascimento, país, obs, promo, telefone)
  - [x] Novo tipo de pedido: comer aqui
  - [x] Seleção de mesa quando tipo = comer aqui

- [x] Atualizar `frontend/src/components/RestaurantePage.jsx`
  - [x] Aba lateral operacional com:
    - [x] Visualização de mesas
    - [x] Status da loja (ativo/desativo)
    - [x] Impressões (status/cadastro de impressora)
    - [x] Integração WhatsApp (QR Code mock + status)

- [ ] Garantir integração sem quebrar fluxo atual
  - [ ] Ajustar criação e renderização de pedidos com novo tipo "COMER_AQUI"
  - [ ] Validar compatibilidade com tabs e componentes existentes
