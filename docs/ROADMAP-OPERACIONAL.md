# ROADMAP OPERACIONAL — ZapFome
> Última atualização: 2026-05-30

---

## Definição: O que é o ZapFome

**ZapFome NÃO é:**
- Cardápio digital
- PDV
- KDS
- Financeiro

**ZapFome É:**

> Um sistema operacional para restaurantes.
>
> O objetivo é que o dono consiga abrir o celular e saber exatamente:
> - onde está perdendo dinheiro
> - o que precisa comprar
> - o que precisa produzir
> - quais pedidos têm problema
> - quanto realmente lucrou

---

## Princípios de Produto

**PRINCÍPIO #1 — Dados confiáveis antes de inteligência.**
Não tem IA confiável em cima de dado errado.

**PRINCÍPIO #2 — Nenhuma feature nova enquanto houver divergência.**
`LOCAL SOURCE ≠ VPS SOURCE ≠ PRODUÇÃO` = parar tudo e resolver.

**PRINCÍPIO #3 — Tudo que impacta dinheiro precisa ser auditável.**
Toda transação financeira deve ter origem rastreável, timestamp e responsável.

**PRINCÍPIO #4 — IA sugere. Sistema decide.**
Nenhuma ação financeira, operacional ou de estoque é executada automaticamente por IA.
O worker detecta → alerta → humano decide.

**PRINCÍPIO #5 — Operação real vale mais que dashboards bonitos.**
Um dado confiável de fechamento de caixa vale mais que dez gráficos de tendência.

---

## As 5 Perguntas Sagradas

O sistema deve responder estas perguntas **todos os dias**, com dados confiáveis:

1. Quanto vendemos?
2. Quanto recebemos?
3. Quanto compramos?
4. Quanto sobrou?
5. O que está pendente?

**Enquanto existir divergência em qualquer uma delas, NÃO construir:**
- IA avançada
- Previsão de demanda
- Automações complexas
- Dashboards novos

---

## Fluxo Operacional Ideal

O objetivo final do ZapFome é cobrir este ciclo completo:

```
Compra
  ↓
Estoque
  ↓
Produção
  ↓
Venda
  ↓
Entrega
  ↓
Recebimento
  ↓
Financeiro
  ↓
DRE
  ↓
Decisão
```

**Hoje o sistema está forte em:**
```
Venda      ✅
Entrega    ✅
Recebimento ✅
```

**O maior gap — e onde estão as maiores perdas financeiras do restaurante:**
```
Compra     ⏳ (OCR de notas, parcial)
Estoque    ⏳ (módulo existe, não validado)
Produção   ○  (não existe ainda)
```

Fechar este ciclo na Degustti por 30 dias sem divergências = base sólida para o restante.

---

## Visão do Produto

Você **não** está construindo apenas um sistema de pedidos.

Você está construindo um **Sistema Operacional para Restaurantes** — em três camadas:

```
Camada 3 │ Sistema Operacional do Restaurante
          │  (decisões, alertas, precificação, produção)
Camada 2 │ Gestão
          │  (caixa, financeiro, estoque, incidents, relatórios)
Camada 1 │ Pedidos
          │  (entrada de pedidos, impressão, entrega, WhatsApp)
```

A Camada 1 está construída e em produção.
A Camada 2 está ~70% construída.
A Camada 3 está iniciada (precificador, IA insights) mas não validada.

---

## Regra Principal

> **Nenhuma feature nova antes de garantir dados confiáveis.**

O sistema precisa responder estas 5 perguntas todos os dias:

1. Quanto vendemos?
2. Quanto recebemos?
3. Quanto compramos?
4. Quanto sobrou?
5. O que está pendente?

---

## Estado Real do Código

### ✅ SPRINT A — Concluída e em produção

| Feature | Arquivo(s) principal(is) |
|---------|--------------------------|
| `closeCaixa` transacional | `saas-backend/src/modules/caixa/` |
| Webhook PIX seguro (OpenPix/Woovi + HMAC) | `saas-backend/src/modules/pix/pix.service.js` |
| `cash_change_for` (troco pedido) | `saas-backend/src/models/Order.js` |
| `cash_change_required` (troco necessário) | `saas-backend/src/models/Order.js` |
| Alerta de troco (WA ao motoboy) | `saas-backend/src/modules/incidents/incidents.service.js` |
| Confirmação de troco | `incidents.service.js → confirmCashChange()` |
| GPS checkout no app do entregador | `saas-frontend/src/pages/DriverApp.jsx` |
| `DeliveryMapPicker` | `saas-frontend/src/components/DeliveryMapPicker.jsx` |
| Polygon matching (taxas por zona) | `saas-frontend/src/components/NewOrderModal.jsx` |
| Rebuild reproduzível (Docker) | `docker-compose.yml` |
| LOCAL SOURCE = VPS SOURCE = PRODUÇÃO | CI/CD via `git pull` + `docker cp` |

> ⚠️ **Geolocalização pendente de validação operacional.**
> Bug "Torres R$20" foi corrigido no código, mas ainda não confirmado em uso real.

---

### ✅ SPRINT B — Incident Engine implantado

**Arquivo:** `saas-backend/src/modules/incidents/incidents.service.js`

Detectores automáticos ativos (via `automation.worker.js`):

| Detector | Lógica |
|----------|--------|
| `cash_difference` | Caixa fechado com diferença entre esperado e contado |
| `cash_change_missing` | Troco não confirmado 30 min após entrega |
| `order_forgotten` | Pedido `pending/confirmed` > 10 min sem atualização |

Detectores definidos mas **não implementados ainda:**
- `item_missing` — item faltando (manual)
- `delivery_late` — entrega com atraso excessivo
- `cancellation` — cancelamento com prejuízo

---

### ⏳ PENDENTE — Validação operacional

- [ ] Confirmar geolocalização / polygon matching com restaurante real
- [ ] Confirmar que `cash_difference` dispara corretamente no fechamento de caixa
- [ ] Confirmar que `order_forgotten` não gera falsos positivos

---

### 🟡 MÓDULOS EXISTENTES MAS NÃO VALIDADOS

**Backend (`saas-backend/src/modules/`):**
- `precificador/` — ficha técnica, custo por ingrediente, overhead, preço psicológico (código existe, UI incompleta)
- `financeiro/` — OCR de notas fiscais via WhatsApp (VPS2 + Ollama)
- `ai/` — insights via IA
- `campaigns/` — campanhas
- `coupons/` — cupons
- `insumos/` — gestão de insumos
- `tables/` — mesas
- `locations/` — localizações
- `promotions/` — promoções
- `ratings/` — avaliações
- `reservations/` — reservas
- `addons/` — adicionais

**Frontend (`saas-frontend/src/pages/`):**
- `KdsPage.jsx` — cozinha digital
- `FidelidadePage.jsx` — fidelidade
- `AddonsPage.jsx` — adicionais
- `AIInsightsPage.jsx` / `AICenterPage.jsx` — central de IA
- `RelatoriosPage.jsx` — relatórios

---

## Automation Worker

**Arquivo:** `saas-backend/src/workers/automation.worker.js`

Jobs ativos (BullMQ):

| Job | Intervalo | Ação |
|-----|-----------|------|
| `stuck-orders` | 5 min | Alerta pedido parado > 15 min |
| `low-stock` | 15 min | Alerta insumos abaixo do mínimo |
| `daily-report` | 08:00 BRT | Relatório financeiro do dia anterior |
| `inactive-clients` | 10:00 BRT | Recupera clientes sem compra há +15 dias |
| `low-sales` | 13:00 BRT | Vendas < 70% da média → cupom + alerta |
| `cmv-anomaly` | 30 min | CMV acima do esperado (usa `pricing_calculations`) |

**Regra:** O worker detecta → `alert.service` → `n8n.service`. A IA interpreta. O banco calcula.

---

## Próximos Passos (ordem de prioridade)

### 1. Validação Operacional (antes de qualquer feature nova)
- Geolocalização em uso real com cliente
- Incident Engine: confirmar que os 3 detectores disparam corretamente
- As 5 perguntas diárias respondem com dados corretos?

### 2. Módulo Produção
O que falta para chegar aqui:
- [ ] Definir o que "Produção" significa no contexto do restaurante (fichas técnicas usadas para pré-preparo?)
- [ ] Integração entre `insumos` + `products` + `precificador`
- [ ] UI de gestão de fichas técnicas (existe parcialmente no precificador)

### 3. Módulo Precificador
O que existe:
- Backend completo: `precificador.service.js` com `calcIngredientCost`, `getOverhead`, `psychologicalPrice`
- Tabela `pricing_overhead` no banco
- Tabela `pricing_calculations` no banco

O que falta:
- [ ] UI completa (página de fichas técnicas, tabela de sugestões de preço)
- [ ] Integração com `insumos` (custo real por insumo atualizado automaticamente)
- [ ] Validação com dados reais de restaurante

---

## O que NÃO desenvolver agora

- Novas integrações de marketplace (iFood, Rappi) — base ainda não estável
- Gamificação / programa de pontos — premature
- App mobile nativo — PWA atual é suficiente
- Funcionalidades de IA generativa para clientes finais — dados ainda não confiáveis

---

## Infraestrutura

```
VPS1 (principal)
├── saas-backend (Node.js + Express)
├── saas-frontend (Vite/React — build estático servido pelo nginx)
├── PostgreSQL
├── Redis (BullMQ)
├── nginx (reverse proxy + serve /uploads/)
└── Evolution API (WhatsApp)

VPS2 (AI Engine — 8GB RAM)
└── Ollama (visão, OCR de notas fiscais)
    └── Recebe imagens via WhatsApp → processa → POST /ingest-processed no VPS1
```

Deploy atual:
```bash
git pull origin main
docker cp src/ saas_backend:/app/src
docker compose restart backend
# Frontend precisa de: VITE_API_URL=https://zapfome.ddns.net no .env antes do build
```

---

## Prompt de Contexto para Nova Conversa

Copie e cole no início de qualquer nova sessão Claude:

```
Antes de continuar qualquer desenvolvimento, leia este contexto:

Projeto: ZapFome — Sistema Operacional para Restaurantes
Stack: Node.js + Express + PostgreSQL + Vite/React (SEM Next.js/Prisma)
Arquivo de referência: /docs/ROADMAP-OPERACIONAL.md

Estado atual:

SPRINT A (concluída):
- closeCaixa transacional
- webhook PIX seguro (OpenPix + HMAC)
- cash_change_for / cash_change_required
- GPS checkout, DeliveryMapPicker, polygon matching
- rebuild reproduzível

SPRINT B (concluída):
- Incident Engine (incidents.service.js)
- Detectores: cash_difference, cash_change_missing, order_forgotten
- Automation Worker (BullMQ): stuck-orders, low-stock, daily-report, etc.

PENDENTE:
- Validação operacional da geolocalização
- Módulo Produção (o que falta: UI de fichas técnicas + integração insumos)
- Módulo Precificador (backend existe, falta UI completa)

REGRA PRINCIPAL:
Nenhuma feature nova antes de garantir dados confiáveis.

As 5 perguntas que o sistema precisa responder todos os dias:
1. Quanto vendemos?
2. Quanto recebemos?
3. Quanto compramos?
4. Quanto sobrou?
5. O que está pendente?

Antes de qualquer sugestão, faça uma auditoria e me diga:
- O que já existe e funciona
- O que existe mas não foi validado
- O que está incompleto
- O que falta para o módulo Produção
- O que falta para o módulo Precificação
- O que NÃO deve ser desenvolvido agora
```
