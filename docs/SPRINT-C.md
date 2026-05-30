# SPRINT C — Fechamento Operacional + Produção
> Última atualização: 2026-05-30
> Duração estimada: 30 dias
> Objetivo: fechar o ciclo Compra → Estoque → Produção → Venda → Lucro

---

## Por que este sprint existe

O ZapFome hoje tem muitas funcionalidades.
Mas o dono do restaurante ainda não consegue abrir uma tela e saber:

- Quanto vendeu hoje
- Quanto comprou hoje
- Quanto produziu hoje
- Quanto lucrou hoje

Sem navegar por 4 páginas diferentes.

Este sprint fecha esse gap.
Não com mais funcionalidades — com integração do que já existe.

---

## Meta do Sprint

> Todo dia às 23h o sistema responde automaticamente:
> 1. Quanto vendemos?
> 2. Quanto recebemos?
> 3. Quanto compramos?
> 4. Quanto sobrou?
> 5. Quanto lucramos?
>
> Sem abrir outras telas. Em uma única página.

---

## Entregável 1 — Fechamento Operacional do Dia

### O que é
Uma página única. O dono abre e entende o restaurante em 30 segundos.
Não é dashboard. Não tem gráficos animados. Tem números.

### Rota
`/fechamento` ou integrada em `FinanceiroPage` como aba "Fechamento"

### Layout da página

```
FECHAMENTO OPERACIONAL — [data]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VENDAS
  Pedidos recebidos     ___
  Pedidos entregues     ___ (___%)
  Faturamento bruto     R$ ___
  Ticket médio          R$ ___

RECEBIMENTOS
  PIX                   R$ ___
  Dinheiro              R$ ___
  Cartão                R$ ___
  Fiado (pendente)      R$ ___
  Total recebido        R$ ___

COMPRAS
  Notas lançadas hoje   ___
  Valor comprado        R$ ___

ESTOQUE
  Itens críticos        ___ itens
  Rupturas registradas  ___

PRODUÇÃO                          ← alimentado pelo Módulo Produção
  Lotes produzidos      ___
  [lista resumida]

PERDAS / INCIDENTES
  Incidentes abertos    ___
  Incidentes resolvidos ___
  Custo dos incidentes  R$ ___

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTADO DO DIA

  Receita               R$ ___
  CMV                   R$ ___ (___%)
  Despesas              R$ ___
                        ─────────
  Lucro operacional     R$ ___   (___% margem)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Fontes de dados (backend)

| Bloco | Query / Serviço |
|-------|----------------|
| Vendas | `financeiro.controller.js → getDailyMetrics()` — já existe |
| Recebimentos | `orders GROUP BY payment_method` — dado existe, falta agregação |
| Compras | `expenses WHERE date = today` + OCR ingest — parcial |
| Estoque crítico | `insumos WHERE current_stock <= alert_threshold` — já existe |
| Produção | **novo** — depende do Módulo Produção |
| Incidentes | `incidents.service.js → getTodaySummary()` — já existe |
| Resultado | `revenue - cmv - expenses` — parcial (expenses depende de lançamentos) |

### O que falta construir
- [ ] Endpoint `GET /api/financeiro/fechamento?date=today` que agrega tudo em um JSON
- [ ] Componente `FechamentoPage.jsx` ou aba em `FinanceiroPage`
- [ ] Recebimentos por forma de pagamento (query simples em `orders`)
- [ ] Bloco Produção (depende do Módulo Produção abaixo)

---

## Entregável 2 — Módulo Produção (Lotes)

### Por que é o módulo mais importante agora

Hoje o sistema sabe que 10kg de arroz entraram (compra) e que 50 marmitas saíram (venda).
Mas não sabe o que aconteceu no meio.

Sem o módulo de Produção:
- CMV é estimado, não real
- Desperdício é invisível
- Estoque diverge todo dia

Com o módulo de Produção:
- Cada lote produzido baixa os insumos exatos
- Cada venda consome os ingredientes da ficha técnica
- CMV vira um número real, não uma aproximação

### Conceito: Lote de Produção

```
ABERTURA DO LOTE
  Data: ___
  Responsável: ___
  Itens produzidos:
    - 10kg arroz cozido    → baixa 12kg arroz cru do estoque
    - 6kg feijão           → baixa 7kg feijão cru do estoque
    - 5kg frango           → baixa 5,5kg frango cru do estoque
  Custo real do lote: R$ ___  (calculado automaticamente)
  Rendimento estimado: ___ porções
```

```
CONSUMO (automático ao vender)
  Marmita P vendida →
    consome 100g arroz cozido do lote ativo
    consome 80g feijão do lote ativo
    consome 120g frango do lote ativo
```

### Schema SQL necessário

```sql
-- Lotes de produção
CREATE TABLE production_lots (
  id            SERIAL PRIMARY KEY,
  tenant_id     INT NOT NULL REFERENCES tenants(id),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  status        VARCHAR(20) DEFAULT 'open', -- open | closed | wasted
  notes         TEXT,
  total_cost    NUMERIC(10,2) DEFAULT 0,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ
);

-- Itens do lote (o que foi produzido)
CREATE TABLE production_lot_items (
  id            SERIAL PRIMARY KEY,
  lot_id        INT NOT NULL REFERENCES production_lots(id),
  insumo_id     INT NOT NULL REFERENCES insumos(id),
  qty_used      NUMERIC(10,3) NOT NULL,  -- quanto de insumo foi usado
  qty_produced  NUMERIC(10,3) NOT NULL,  -- quanto rendeu (pode ter fator de perda)
  unit          VARCHAR(20),
  cost          NUMERIC(10,2),           -- custo calculado automaticamente
  waste_pct     NUMERIC(5,2) DEFAULT 0   -- % de perda registrada
);

-- Perdas explícitas (desperdício)
CREATE TABLE production_waste (
  id            SERIAL PRIMARY KEY,
  tenant_id     INT NOT NULL REFERENCES tenants(id),
  lot_id        INT REFERENCES production_lots(id),
  insumo_id     INT NOT NULL REFERENCES insumos(id),
  qty           NUMERIC(10,3) NOT NULL,
  reason        TEXT,
  cost          NUMERIC(10,2),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### API necessária

```
POST   /api/producao/lotes              → abrir lote
GET    /api/producao/lotes?date=today   → listar lotes do dia
GET    /api/producao/lotes/:id          → detalhe do lote
PATCH  /api/producao/lotes/:id/fechar   → fechar lote (baixa estoque)
POST   /api/producao/lotes/:id/perda    → registrar desperdício
GET    /api/producao/resumo?date=today  → resumo para o Fechamento
```

### UI necessária

**Tela: Produção**
- Botão "Abrir Lote do Dia"
- Lista de insumos com campo de quantidade usada
- Cálculo automático de custo ao preencher
- Botão "Fechar Lote" → baixa estoque automaticamente
- Histórico de lotes (tabela por data)

**Integração com Fechamento:**
- Bloco Produção no Fechamento puxa `GET /api/producao/resumo?date=today`

### O que falta construir
- [ ] Schema SQL (tabelas acima)
- [ ] `saas-backend/src/modules/producao/` (service + controller + routes)
- [ ] `saas-frontend/src/pages/ProducaoPage.jsx`
- [ ] Integração com `insumos` (baixar estoque ao fechar lote)
- [ ] Integração com `precificador` (ficha técnica alimenta o lote automaticamente)
- [ ] Bloco no Fechamento Operacional

---

## Prioridade dos 30 dias

```
Semana 1 — Validação (zero código novo)
  ✅ Validar geolocalização com entrega real na Degustti
  ✅ Validar Incident Engine (cash_difference, order_forgotten, cash_change_missing)
  ✅ Validar módulo de insumos (estoque bate com realidade?)
  ✅ As 5 perguntas sagradas respondem com dados confiáveis?

Semana 2 — Fechamento Operacional
  ○ Endpoint /api/financeiro/fechamento
  ○ FechamentoPage (sem bloco Produção ainda)
  ○ Recebimentos por forma de pagamento
  ○ Rodar 1 semana com o dono usando a tela

Semana 3 — Módulo Produção
  ○ Schema SQL + migration
  ○ CRUD de lotes (backend)
  ○ ProducaoPage (frontend)
  ○ Integração com estoque (baixa automática ao fechar lote)

Semana 4 — Integração e validação
  ○ Bloco Produção no Fechamento Operacional
  ○ CMV real (via lotes) substituindo CMV estimado
  ○ 7 dias de operação completa sem divergência
  ○ Revisar as 10 métricas com dados reais
```

---

## Critério de conclusão do Sprint C

O sprint está concluído quando:

```
✅ Dono abre /fechamento e vê os 5 números em < 30 segundos
✅ Lote de produção é aberto e fechado todo dia (baixa estoque real)
✅ CMV do Fechamento usa custo real dos lotes, não estimativa
✅ 7 dias seguidos sem divergência nas 5 perguntas sagradas
✅ Nenhum incidente aberto ao fechar o caixa
```

Quando isso estiver consistente por 30 dias:
→ Precificador completo
→ Previsão de demanda
→ IA de decisão (dados reais finalmente disponíveis)

---

## O que NÃO entra neste sprint

- Módulo de IA avançada
- Previsão de demanda
- Novas integrações de marketplace
- Gamificação / fidelidade melhorada
- Push notifications
- Novos relatórios

**Regra:** qualquer PR que não seja Fechamento, Produção ou correção de bug operacional é recusado neste sprint.
