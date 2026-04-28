# TODO: Implementação de Push Notifications + Bug Fixes

## Phase 1: Bug Fix Crítico
- [x] Fix `CheckoutPage.jsx` — address input shadowing bug

## Phase 2: Backend Push Infrastructure
- [x] Add `pywebpush` to `requirements.txt`
- [x] Add `PushSubscription` model + in-memory store
- [x] Add endpoints: `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`
- [x] Add `send_push_notification()` helper
- [x] Integrate push notifications into order flow

## Phase 3: Frontend Service Worker & Push Manager
- [x] Create `frontend/public/service-worker.js`
- [x] Create `frontend/src/lib/pushNotifications.js`
- [x] Integrate push into `CheckoutPage.jsx`
- [x] Integrate push into `AcompanhamentoPedido.jsx`
- [x] Integrate push into `PainelPedidosRestaurante.jsx`

## Phase 4: Finalização
- [x] Update `TODO_PEDIDOS.md`
- [x] Test e validação — backend compila OK, push endpoints integrados

