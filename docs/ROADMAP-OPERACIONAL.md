# ROADMAP OPERACIONAL — ZapFome
> Última atualização: 2026-05-30 (revisado pós-auditoria técnica completa)

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

## KPI Oficial — DIAS SEM DIVERGÊNCIA

O indicador mais importante do ZapFome neste momento não é receita, pedidos ou NPS.
É este:

```
DIAS SEM DIVERGÊNCIA: 0
```

**Critérios para contar um dia como "sem divergência":**

| Critério | Como verificar |
|----------|---------------|
| Caixa conciliado | `closeCaixa` sem `cash_difference` |
| `order_items.total_cost > 0` em todos os pedidos | Query diária em `order_items` |
| Nenhum `inventory_deduction_failed` | `operational_incidents` do dia |
| Nenhum pedido com `insumos_deducted = false` após confirmação | Query em `orders` |
| `cmv-anomaly` sem falso positivo | Log do `automation.worker.js` |

**Meta:** 7 dias consecutivos sem divergência na Degustti.

**Quando chegar em 7 dias:** o sistema pode ser considerado confiável para a próxima fase.

**Quando chegar em 30 dias:** o ZapFome está pronto para ser oferecido a outros restaurantes com confiança operacional real.

> Nenhuma feature nova — tracking, IA, produção, previsão de demanda — é liberada
> antes de 7 dias consecutivos sem divergência.

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

## Sprint 3 — Próximos Passos (ordem obrigatória)

> Esta ordem não é sugestão. É resultado de auditoria técnica completa dos módulos
> insumos, precificador, orders e automation worker. Alterar a ordem gera retrabalho.

### P0 — Validação Geográfica (ANTES DE QUALQUER CÓDIGO NOVO)

**Meta:** 30 pedidos reais com 30/30 corretos.

**Checklist por pedido:**

| Item | OK |
|------|----|
| GPS captura posição correta | ☐ |
| Bairro identificado corretamente | ☐ |
| Zona correta (sem cair em Torres R$20) | ☐ |
| Frete calculado corretamente | ☐ |
| Pin aparece no mapa no endereço certo | ☐ |
| `delivery_lat` e `delivery_lng` persistidos no banco | ☐ |

**Critério de aprovação:** 30/30 pedidos corretos.

**Se reprovar:** parar tudo. Corrigir polygon matching antes de qualquer avanço.
Toda a lógica de entrega, rota e tracking depende desse dado estar correto.

---

### P0.5 — Saneamento Financeiro da Logística ⚠️ BLOQUEADOR

> **Descoberta da auditoria de regras de negócio (2026-05-30):**
> O sistema trata `orders.total = produtos + delivery_fee` como receita do restaurante.
> Na prática, a taxa de entrega pertence (parcialmente) ao motoboy.
> Construir o Fechamento sobre esses números geraria um lucro inflado todos os dias.

**Problema central:**
```
Pedido R$ 40 + taxa R$ 10 = total R$ 50

Sistema hoje:   receita = R$ 50  ← errado
Realidade:      receita = R$ 43  (R$ 40 + R$ 3 margem logística)
Repasse:        R$ 7 → motoboy  (driver_fee, gravado mas nunca descontado)
```

**Impacto em cascata:**
- Faturamento inflado todos os dias
- Lucro inflado pelo valor que vai ao motoboy
- CMV calculado sobre base errada
- `cash_difference` dispara sistematicamente para entregas em dinheiro (caixa espera R$50, motoboy entrega R$43)

**O que precisa ser feito (nesta ordem):**

1. **`products_total` explícito** — `orders.total - orders.delivery_fee`. Já existe `delivery_fee` na tabela. Não precisa de nova coluna: é cálculo derivado.

2. **`driver_fee_pct` configurável** — hoje hardcoded a 70% em dois lugares (`driver.service.js` linhas 170 e 380). Mover para campo `tenants.driver_fee_pct DEFAULT 70`.

3. **Fechamento financeiro correto:**
```
Vendas (produtos):       SUM(total - delivery_fee)
Taxas entrega cobradas:  SUM(delivery_fee) WHERE delivery_type='delivery'
Repasse motoboys:       -SUM(driver_fee) FROM deliveries WHERE status='delivered'
Resultado logística:     taxas - repasse
Receita operacional:     vendas + resultado_logística
```

4. **Caixa espera o valor correto** — para pedidos em dinheiro com entrega, o esperado é `products_total + (delivery_fee - driver_fee)`, não `total`. Corrigir a query de `expected_cash` em `closeCaixa`.

5. **Validação de `delivery_fee = 0`** para `delivery_type = pickup | table` na criação do pedido.

6. **Separação por `delivery_type` nos relatórios** — backend passa a agrupar por tipo para o Fechamento mostrar:
```
Entrega:  85 pedidos — R$ 3.200 (produtos)
Retirada: 40 pedidos — R$ 1.100
Mesa:     15 pedidos — R$   850
```

**Por que bloqueia o P1:**
O Fechamento Operacional só tem valor se o número mostrado for economicamente correto.
Um lucro inflado em R$7 por pedido de entrega × 80 pedidos/dia = R$560/dia de distorção.
Em 30 dias: R$16.800 de diferença entre "lucro no sistema" e "lucro real".

---

### P1 — Fechamento Operacional do Dia

**Pré-requisito: P0.5 concluído.**

**Objetivo:** o dono abre uma tela às 23h e entende o dia em 30 segundos.

**Backend:** `GET /api/operacao/fechamento-hoje`

**Frontend:** `FechamentoPage.jsx` — uma página, sem tabs, sem gráficos.

Exemplo do que o dono vê (pós P0.5):
```
FECHAMENTO — 30/05/2026
━━━━━━━━━━━━━━━━━━━━━━━
Vendas (produtos):    R$ 3.200,00
Taxas entrega:        R$   282,90
Repasse motoboys:    -R$   197,90
Receita operacional:  R$ 3.285,00
━━━━━━━━━━━━━━━━━━━━━━━
Por canal:
  🚚 Entrega  85 ped.  R$ 3.200
  🏃 Retirada 40 ped.  R$ 1.100
  🍽️ Mesa     15 ped.  R$   850
━━━━━━━━━━━━━━━━━━━━━━━
Despesas:    R$   814,50
CMV:         31,4%  (72% pedidos com custo válido)
Lucro bruto: R$ 2.470,50
━━━━━━━━━━━━━━━━━━━━━━━
Incidentes:  2
Trocos pend: 1
━━━━━━━━━━━━━━━━━━━━━━━
Saúde oper.: 94/100
```

---

### P2 — Dashboard de Confiabilidade

Tela simples mostrando os 5 critérios do KPI e o contador de dias sem divergência.
Não é IA. Não é gráfico. É um semáforo por critério + um número.

---

### O que NÃO faz parte da Sprint 3

```
❌ Tracking do motoboy
❌ Módulo Produção (UI completa)
❌ IA operacional
❌ Novas automações n8n
❌ Novos dashboards
❌ Integrações de marketplace
```

---

### Sprint 4 — após 7 dias sem divergência

```
Módulo Produção:
- lotes de produção
- rendimento real
- perdas
- CMV real por lote

Precificador completo:
- UI de fichas técnicas
- custo atualizado automaticamente quando insumo muda
- pricing_review_queue
```

### Sprint 5 — após Produção validado

```
Tracking do motoboy (ver ADR abaixo)
Previsão de demanda
IA de decisão operacional
DRE automatizado
```

---

### O que ainda não existe e é o coração do problema

```
Compra      ⏳ OCR parcial
Estoque     ⏳ módulo existe, não validado
Produção    ○  não existe — Sprint 4
Venda       ✅
Entrega     ✅ (pendente validação geo)
Recebimento ✅
Financeiro  ✅ parcial
Lucro real  ○  depende de Produção + Compra fechados
```

Enquanto Compra → Estoque → Produção não estiver fechado:
- CMV é estimado, não real
- Desperdício é invisível
- Lucro operacional é aproximação

---

## O que NÃO desenvolver agora

- Novas integrações de marketplace (iFood, Rappi) — base ainda não estável
- Gamificação / programa de pontos — premature
- App mobile nativo — PWA atual é suficiente
- Funcionalidades de IA generativa para clientes finais — dados ainda não confiáveis
- Tracking do motoboy — somente após geo validada (ver ADR abaixo)
- Produção completa — somente após 7 dias sem divergência

---

## ADR — Sequenciamento da Rota do Motoboy

> **Decisão:** implementar em fases. Não construir otimização antes de validar o básico.

### Fase 1 — Manual (próxima implementação após Sprint 3)

O operador define a ordem da rota. O motoboy avança entrega por entrega.

```
Rota 11:30
1. Cliente A  ← atual
2. Cliente B
3. Cliente C
4. Cliente D

Motoboy confirma entrega → sistema avança para Cliente B
```

**Vantagem:** sem algoritmo, sem Google Maps API, sem custo. Válido para Degustti
com rotas programadas (10:30, 11:00, 11:30, 12:30).

**O que o cliente vê:**
```
Seu pedido está na rota das 11:30
Você é a entrega 3 de 7
Previsão: 11:18
```

### Fase 2 — Semi-automática (após Fase 1 validada)

Sistema sugere ordem por distância/bairro/CEP. Motoboy pode alterar.

### Fase 3 — Automática (longo prazo)

Otimização por distância + tempo + trânsito + volume. Semelhante ao iFood/Mercado Livre.

---

## ADR — Tracking do Motoboy

> **Decisão:** implementar somente após geolocalização de clientes validada (P0 Sprint 3).

### Versão 1 — Mínima (Sprint 5)

- `watchPosition` com throttle de 5-10 segundos no `DriverApp.jsx`
- Backend salva apenas posição atual (`current_lat`, `current_lng`) na sessão
- Socket.io emite para `order:{orderId}` a cada atualização
- Cliente vê marcador se movendo no mapa
- **Sem histórico de rota no banco** (Versão 2)

```
Tabela: delivery_tracking_sessions
- id, order_id, driver_name
- current_lat, current_lng, updated_at
- started_at, ended_at, active
```

### Versão 2

Histórico de rota, ETA automático, múltiplas paradas.

### Versão 3

Otimização automática, integração com Health Engine do entregador.

> **Por que não agora:** se o polygon matching ainda cobra frete errado,
> o cliente verá o motoboy no lugar certo mas pagou frete errado — confiança zero.
> Geo primeiro. Tracking depois.

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
Antes de continuar qualquer desenvolvimento, leia:
/docs/ROADMAP-OPERACIONAL.md

Projeto: ZapFome — Sistema Operacional para Restaurantes
Stack: Node.js + Express + PostgreSQL + Vite/React (SEM Next.js/Prisma)

Estado atual (pós-auditoria técnica completa — 2026-05-30):

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

SEMANA 1 DA SPRINT 3 (concluída):
- insumo_movements — audit trail de ajustes de estoque
- deductForOrder com log estruturado + inventory_deduction_failed
- deductForOrder idempotente (orders.insumos_deducted + FOR UPDATE)

SEMANA 2 DA SPRINT 3 (concluída):
- products.cost_price_source (manual | precificador)
- psychologicalPrice corrigido (preco_sugerido nunca < preco_ideal)
- POST /precificador/apply/:productId — liga precificador ao produto
- cmv-anomaly query corrigida (produto cartesiano removido)

PRÓXIMOS PASSOS (ordem obrigatória):
P0   — Validação geográfica (30 pedidos reais, 0 fretes errados) — FORA DO CÓDIGO
P0.5 — Saneamento financeiro da logística — BLOQUEADOR DO FECHAMENTO
P1   — Fechamento Operacional do Dia
P2   — Dashboard de Confiabilidade

AUDITORIA DE REGRAS DE NEGÓCIO (2026-05-30) — ACHADOS CRÍTICOS:
- orders.total inclui delivery_fee: faturamento e lucro estão inflados
- driver_fee gravado em deliveries mas NUNCA descontado do financeiro
- driver_fee_pct hardcoded a 70% em dois lugares (driver.service.js linhas 170 e 380)
- closeCaixa espera orders.total: gera cash_difference sistemático para entregas em dinheiro
- delivery_type existe mas não é usado em nenhum relatório financeiro
- Sem separação Entrega / Retirada / Mesa nos relatórios

P0.5 REQUER (nesta ordem):
1. products_total = total - delivery_fee (campo derivado, sem migration)
2. tenants.driver_fee_pct DEFAULT 70 (configurável por tenant)
3. Fechamento usa products_total + resultado_logística como receita
4. closeCaixa espera products_total + (delivery_fee - driver_fee) para pedidos em dinheiro
5. Validação: deliveryFee = 0 para pickup/table
6. Relatórios agrupam por delivery_type

REGRA PRINCIPAL:
Nenhuma feature nova antes de 7 dias consecutivos sem divergência operacional.

KPI OFICIAL — DIAS SEM DIVERGÊNCIA:
1. Caixa conciliado (sem cash_difference por design)
2. order_items.total_cost > 0 em todos os pedidos
3. Nenhum inventory_deduction_failed
4. Nenhum pedido com insumos_deducted = false após confirmação
5. cmv-anomaly sem falso positivo

O QUE NÃO DEVE SER DESENVOLVIDO AGORA:
- Tracking do motoboy (somente após geo validada)
- Módulo Produção completo (somente após 7 dias sem divergência)
- IA operacional
- Novas integrações de marketplace
- Novos dashboards complexos
```

