# MÉTRICAS OPERACIONAIS — ZapFome
> Última atualização: 2026-05-30

---

> **Tudo que não pode ser medido não pode ser melhorado.**

Este documento define os **10 indicadores obrigatórios** do dia.
São a diferença entre operar um restaurante e *achar* que está operando.

---

## Os 10 Indicadores

### M1 — Pedidos Recebidos Hoje
**O que mede:** volume de entrada do dia.
**Fonte:** `SELECT COUNT(*) FROM orders WHERE DATE(created_at) = today AND tenant_id = $1`
**Status:** ✅ calculado — `financeiro.controller.js → getDailyMetrics()`
**Meta:** crescimento semana a semana.

---

### M2 — Pedidos Entregues
**O que mede:** taxa de conclusão operacional.
**Fonte:** `SELECT COUNT(*) FROM orders WHERE status = 'delivered' AND DATE(created_at) = today`
**Status:** ✅ calculado — `financeiro.controller.js`
**Meta:** M2 / M1 > 95%. Abaixo disso: investigar cancelamentos.

---

### M3 — Pedidos Esquecidos
**O que mede:** falhas de atenção operacional.
**Fonte:** `operational_incidents WHERE type = 'order_forgotten' AND DATE(created_at) = today`
**Status:** ✅ detectado automaticamente — `incidents.service.js → detectForgottenOrders()`
**Meta:** zero. Qualquer dia com M3 > 0 exige revisão do fluxo de notificação.

---

### M4 — Incidentes Abertos
**O que mede:** problemas não resolvidos que ainda impactam o caixa.
**Fonte:** `SELECT COUNT(*) FROM operational_incidents WHERE resolved = FALSE AND tenant_id = $1`
**Status:** ✅ calculado — `incidents.service.js → getTodaySummary()`
**Meta:** zero ao fechar o caixa. Nenhum dia termina com incidente aberto sem justificativa.

---

### M5 — Incidentes Resolvidos
**O que mede:** capacidade de resposta operacional.
**Fonte:** `operational_incidents WHERE resolved = TRUE AND DATE(resolved_at) = today`
**Status:** ✅ calculado — `incidents.service.js → getTodaySummary()`
**Meta:** M5 = total de incidentes do dia (tudo resolvido antes do fechamento).

---

### M6 — Diferença de Caixa
**O que mede:** divergência entre o esperado e o contado no fechamento.
**Fonte:** `cash_sessions WHERE closed_at IS NOT NULL AND DATE(closed_at) = today → (expected - counted)`
**Status:** ✅ detectado — `incidents.service.js` tipo `cash_difference`
**Meta:** R$ 0,00. Qualquer diferença precisa ter explicação registrada.
**Alerta:** diferença recorrente = problema sistêmico (troco, cancelamento, furto).

---

### M7 — CMV Médio do Dia
**O que mede:** custo da mercadoria vendida como % da receita.
**Fórmula:** `(custo dos ingredientes vendidos / receita total) × 100`
**Fonte:** `dashboard.service.js → cmvPct` (baseado em `pricing_calculations`)
**Status:** ✅ calculado — `dashboard.service.js` (alerta se CMV > 45%)
**Meta:** < 35% para delivery. > 45% = prejuízo operacional provável.
**Limitação atual:** CMV só é preciso se as fichas técnicas estiverem cadastradas no Precificador.

---

### M8 — Itens com Estoque Crítico
**O que mede:** risco de falta de insumo no próximo turno.
**Fonte:** `insumos WHERE current_stock <= alert_threshold AND tenant_id = $1`
**Status:** ✅ detectado — worker `low-stock` a cada 15 min, alerta via WhatsApp
**Meta:** zero itens críticos na abertura. Se M8 > 0 no dia seguinte = compra não foi feita.

---

### M9 — Tempo Médio de Preparo
**O que mede:** eficiência da cozinha.
**Fórmula:** `AVG(confirmed_at - created_at)` para pedidos do dia
**Fonte:** `orders WHERE status IN ('ready','delivered') AND DATE(created_at) = today`
**Status:** ⏳ dado existe no banco, mas **não é calculado nem exibido ainda**
**Meta:** < 20 min para delivery. > 30 min = gargalo na cozinha.
**O que falta:** endpoint + card no Dashboard.

---

### M10 — Lucro Operacional do Dia
**O que mede:** quanto sobrou de verdade.
**Fórmula:** `Receita − CMV − Despesas do dia (registradas)`
**Fonte:** `financeiro.controller.js → gross_profit` + `expenses` do dia
**Status:** ✅ receita e gross_profit calculados. ⚠️ despesas só entram se forem registradas manualmente ou via OCR de nota.
**Meta:** margem líquida > 20% para o modelo de delivery ser sustentável.
**Limitação atual:** M10 só é confiável quando Compra → Estoque estiver fechado (ciclo completo).

---

## Painel Diário

O sistema deve exibir estes 10 números em uma tela única, no fechamento do dia:

```
RESUMO DO DIA — [data]

M1  Pedidos recebidos     ___
M2  Pedidos entregues     ___   (___%)
M3  Pedidos esquecidos    ___   ← meta: 0
M4  Incidentes abertos    ___   ← meta: 0 ao fechar
M5  Incidentes resolvidos ___
M6  Diferença de caixa    R$ ___   ← meta: R$ 0,00
M7  CMV médio             ___%     ← meta: <35%
M8  Estoque crítico       ___ itens ← meta: 0
M9  Tempo médio preparo   ___ min  ← meta: <20 min
M10 Lucro operacional     R$ ___   ← meta: >20% margem
```

---

## Status por Indicador

| # | Métrica | Calculado? | Exibido no sistema? |
|---|---------|------------|---------------------|
| M1 | Pedidos recebidos | ✅ | ✅ Dashboard |
| M2 | Pedidos entregues | ✅ | ✅ Dashboard |
| M3 | Pedidos esquecidos | ✅ | ⏳ Incidents, não no Dashboard |
| M4 | Incidentes abertos | ✅ | ⏳ IncidentsBanner, não centralizado |
| M5 | Incidentes resolvidos | ✅ | ⏳ Incidents, não no Dashboard |
| M6 | Diferença de caixa | ✅ | ⏳ Caixa, não no resumo do dia |
| M7 | CMV médio | ✅ | ⏳ Dashboard (só alerta, sem card) |
| M8 | Estoque crítico | ✅ | ⏳ WhatsApp alerta, sem card visual |
| M9 | Tempo médio preparo | ❌ | ❌ não calculado |
| M10 | Lucro operacional | ⚠️ parcial | ⏳ Financeiro (sem despesas completas) |

---

## Critério de Saúde Operacional

O dia foi **operacionalmente saudável** quando:

```
M3 = 0            (nenhum pedido esquecido)
M4 = 0            (nenhum incidente aberto ao fechar)
M6 = R$ 0,00      (caixa fechou sem diferença)
M7 < 35%          (custo controlado)
M8 = 0            (estoque ok para o próximo dia)
M10 > 0           (não operou no prejuízo)
```

Enquanto qualquer um desses critérios falhar de forma recorrente:
**não construir novas features — corrigir o que está quebrado na operação.**

---

## O que vem depois

Quando a Degustti conseguir 30 dias consecutivos com os 10 indicadores confiáveis:

1. **Módulo Produção** — conectar pré-preparo ao estoque (M8 fica automático)
2. **Precificador completo** — fichas técnicas cadastradas tornam M7 preciso
3. **Previsão de demanda** — M1 histórico alimenta projeção do próximo dia
4. **DRE automatizado** — M10 calculado sem intervenção manual
5. **IA de decisão** — só faz sentido com dados confiáveis por trás
