# TODO - Estruturação Restaurante (Fases 1 e 2)

## Retomada atual — execução
- [x] Revisar estado atual do backend de impressão (`/api/print/direct`)
- [x] Executar bateria local `tests/test_print_direct_local.py` (401/400/200)
- [x] Corrigir backend/frontend caso algum cenário falhe (sem correções necessárias nesta rodada)
- [x] Atualizar este TODO com resultados da validação
  - [x] no_token: 401
  - [x] invalid_token: 401
  - [x] empty_content: 400
  - [x] oversized: 400
  - [x] valid: 200 (`PRINT_SENT`)

## Fase 1 — Arquitetura UI RestaurantePage (Shell + Sidebar + Tabs + Estado Global)
- [x] Refinar shell visual (Tema Claro padrão + toggle para Modern-Dark / Sper-UX)
  - [x] Header com ações primárias destacadas e switch de tema (Claro/Dark)
  - [x] Navegação de tabs mais clara (estado ativo/hover/foco) em ambos os temas
  - [ ] Responsividade mobile-first (toque e leitura)

- [ ] Melhorar sidebar operacional
  - [ ] Bloco status da loja com feedback visual forte
  - [ ] Bloco mesas com leitura rápida de ocupação
  - [ ] Bloco integrações (WhatsApp/Evolution) com estados
  - [ ] Bloco impressoras com cadastro e status

- [ ] Consolidar estado compartilhado no RestaurantePage
  - [ ] Fonte única para status de loja/mesas/impressão
  - [ ] Preparar props para fluxos de pedidos sem duplicação

## Fase 2 — Pedidos (Novo Pedido + Busca + Mesas + Views + Impressão)
- [x] Consolidar fluxo de novo pedido
  - [ ] Busca cliente por telefone/nome com UX mais clara
  - [ ] Cadastro inline de cliente com validações mínimas
  - [x] Tipos de pedido: entrega, retirada, comer aqui
  - [x] Seleção de mesa obrigatória para “comer aqui”

- [x] Garantir integração entre NovoPedido e Painel de Pedidos
  - [x] Ajustar payload/status para tipo `comer_aqui`
  - [ ] Garantir renderização consistente em Card/List/Kanban/Compact
  - [x] Reimpressão icon-only padronizada em todas as views

- [ ] Impressão direta e robustez
  - [ ] Garantir chamada backend `/api/print/direct` com token
  - [ ] Tratar feedback visual (loading/sucesso/erro)
  - [ ] Manter auto-impressão no criar pedido sem bloquear UI

## Validação (após fases 1 e 2)
- [ ] Teste frontend: fluxos pedidos + reimpressão + auto-impressão
- [ ] Teste API `/api/print/direct`: 401/400/200 e edge cases
- [ ] Ajustes finais de UX com base nos achados
