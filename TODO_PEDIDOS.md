# TODO: Sistema de Pedidos Completo

## Fase 1: Backend (Modelo + API) ✅ CONCLUÍDO
- [x] Modelo de Pedido completo (Pydantic) — `PedidoItem`, `EnderecoEntrega`, `PedidoCreate`, `PedidoUpdateStatus`, `PedidoAvaliacao`
- [x] Endpoints CRUD de pedidos — `POST/GET /api/pedidos`, `GET /api/pedidos/{id}`, `PATCH /api/pedidos/{id}/status`, `POST /api/pedidos/{id}/avaliar`
- [x] Fluxo de status com validação — `PENDENTE → CONFIRMADO → EM_PREPARO → PRONTO → EM_ENTREGA → ENTREGUE` + cancelamento
- [x] Timeout automático — task `verificar_timeout_pedidos()` roda a cada 60s (10min pendente, 5min confirmado, etc.)
- [x] WebSocket broadcast — `broadcast_pedido_status()` notifica todos os clientes conectados
- [x] Histórico de pedidos — `statusTimeline` em cada pedido + endpoint `/api/pedidos/{id}/timeline`
- [x] Estatísticas — endpoint `/api/pedidos/stats/{restaurante_id}` com agregação por status
- [x] Task background — iniciada no startup do FastAPI

## Fase 2: Frontend — Painel do Restaurante ✅ CONCLUÍDO
- [x] Tela de pedidos recebidos (com som de notificação) — componente `PainelPedidosRestaurante.jsx`
- [x] Botões: Aceitar / Rejeitar / Pronto / Despachar / Entregue — com confirmação de cancelamento
- [x] Timer mostrando tempo desde criação — `formatTimeAgo()` atualizado a cada render
- [x] Filtros por status — tabs com contagem dinâmica
- [x] Notificação visual + sonora — alerta animado + beep (Web Audio API) ao receber pedido pendente
- [x] WebSocket + polling fallback — atualizações em tempo real
- [x] Rota adicionada — `/restaurante/pedidos`

## Fase 3: Frontend — Acompanhamento Cliente ✅ CONCLUÍDO
- [x] Tela de "Meus Pedidos" — componente `AcompanhamentoPedido.jsx` com rota `/pedido/:pedidoId`
- [x] Timeline de status visual — etapas com ícones, cores e descrições
- [x] Rastreamento em tempo real (WebSocket) — conecta `/ws/track/{order_id}` + polling fallback
- [x] Avaliação após entrega — modal com estrelas 1-5 + comentário, integrado com API

## Fase 4: Integração ✅ CONCLUÍDO
- [x] Carrinho → Checkout → Pedido — componente `CheckoutPage.jsx` com cardápio, carrinho, checkout e sucesso
- [x] Persistência local — carrinho e dados do cliente salvos no localStorage
- [x] Integração completa — envio para `POST /api/pedidos` e redirecionamento para acompanhamento
- [x] Notificações push (browser) — Web Push API (VAPID + Service Worker)
- [ ] Testes end-to-end — Cypress/Playwright (futuro)

## Fase 4: Integração
- [ ] Carrinho → Checkout → Pedido
- [ ] Notificações push (browser)
- [ ] Testes end-to-end

