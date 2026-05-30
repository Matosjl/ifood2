# OPERAÇÃO DEGUSTTI
> Documento operacional — não é documentação técnica.
> Última atualização: 2026-05-30

Este documento descreve como o restaurante deve operar **usando o ZapFome**.
Cada passo tem uma ação humana e uma ação no sistema.

---

## ABERTURA

**Horário:** antes de receber o primeiro pedido.

| # | Ação humana | Ação no sistema |
|---|-------------|-----------------|
| 1 | Abrir caixa | Configurações → Caixa → Abrir Caixa (informar valor inicial) |
| 2 | Conferir PIX | Verificar se webhook OpenPix está ativo (ícone PIX no header) |
| 3 | Conferir impressora | Enviar pedido de teste — comanda deve sair na cozinha |
| 4 | Conferir estoque crítico | Dashboard → alertas de estoque baixo (BullMQ `low-stock`) |
| 5 | Conferir WhatsApp conectado | Configurações → WhatsApp → Status = Conectado |

**Critério de abertura:** caixa aberto + PIX ativo + impressora funcionando.
Sem isso, não iniciar operação.

---

## PRODUÇÃO

**Horário:** após abertura, antes do pico.

| # | Item | Observação |
|---|------|------------|
| 1 | Arroz | — |
| 2 | Feijão | — |
| 3 | Mistura do dia | Registrar qual mistura foi produzida |
| 4 | Molhos / acompanhamentos | — |

> **Pendente no sistema:** módulo de Produção ainda não existe.
> Hoje este controle é manual. Meta: integrar com Estoque e Insumos.

---

## VENDAS

**Todo pedido deve ter obrigatoriamente:**

| Campo | Por quê |
|-------|---------|
| Forma de pagamento | Fechamento de caixa correto |
| Localização (endereço ou mesa) | Entrega correta + taxa por zona |
| Troco (se dinheiro) | `cash_change_required` — previne incidente `cash_change_missing` |

**Regras de operação:**
- Pedido sem forma de pagamento = **não confirmar**
- Pedido delivery sem endereço = **não confirmar**
- Pedido em dinheiro sem troco informado = **não confirmar**

**Alertas automáticos ativos:**
- Pedido parado > 10 min → incidente `order_forgotten` criado
- Pedido parado > 15 min → alerta WhatsApp ao dono (worker `stuck-orders`)

---

## ENTREGA

| # | Evento | Ação no sistema |
|---|--------|-----------------|
| 1 | Pedido saiu com o motoboy | Kanban → arrastar para "Em entrega" |
| 2 | Pedido entregue | Kanban → arrastar para "Entregue" |
| 3 | Troco entregue? | OrderCard → confirmar troco (sim/não) |

**Se troco NÃO foi entregue:**
- Marcar como "não entregue" no sistema
- Incidente `cash_change_missing` criado automaticamente
- Resolver antes do fechamento

**GPS:**
- App do entregador registra localização no checkout
- Dado fica em `orders.checkout_lat / checkout_lng`
- ⚠️ Validação operacional ainda pendente (bug "Torres R$20" corrigido, não confirmado em produção)

---

## FECHAMENTO

**Horário:** após último pedido do dia.

| # | Ação humana | Ação no sistema |
|---|-------------|-----------------|
| 1 | Contar dinheiro em caixa | — |
| 2 | Fechar caixa | Financeiro → Caixa → Fechar Caixa (informar valor contado) |
| 3 | Conferir diferença | Sistema mostra: esperado vs. contado → `cash_difference` |
| 4 | Se houver diferença | Registrar motivo (incidente manual ou automático) |
| 5 | Conferir incidentes do dia | Dashboard → Incidents → listar abertos |
| 6 | Resolver incidentes pendentes | Marcar como resolvido com descrição |
| 7 | Conferir PIX recebidos | Financeiro → PIX → conciliar com pedidos pagos via PIX |

**Critério de fechamento:** caixa fechado + zero incidentes abertos sem justificativa.

---

## AS 5 PERGUNTAS DO DIA

Após o fechamento, o sistema deve conseguir responder:

| Pergunta | Onde ver no sistema |
|----------|---------------------|
| Quanto vendemos? | Dashboard → total do dia |
| Quanto recebemos? | Financeiro → recebimentos (dinheiro + PIX + cartão) |
| Quanto compramos? | Financeiro → despesas (notas fiscais via WhatsApp) |
| Quanto sobrou? | Financeiro → DRE do dia |
| O que está pendente? | Dashboard → incidentes abertos + trocas pendentes |

> Se qualquer uma dessas perguntas não tiver resposta confiável,
> **parar tudo e corrigir antes de desenvolver qualquer feature nova.**

---

## INCIDENTES FREQUENTES

| Incidente | Causa mais comum | Como prevenir |
|-----------|------------------|---------------|
| `cash_difference` | Troco errado dado ao cliente | Sempre confirmar troco no sistema |
| `cash_change_missing` | Motoboy não confirmou troco | Treinamento + confirmação obrigatória no app |
| `order_forgotten` | Pedido recebido mas não visto | Verificar notificações / som do sistema |
| PIX não conciliado | Webhook com atraso | Verificar status OpenPix nas configurações |

---

## FLUXO COMPLETO DO DIA

```
ABERTURA
  → Caixa aberto
  → PIX ativo
  → Impressora ok
  → Estoque verificado
  → WhatsApp conectado
        ↓
PRODUÇÃO
  → Itens do dia preparados
        ↓
VENDAS
  → Todo pedido: pagamento + local + troco
        ↓
ENTREGA
  → Saiu → Entregue → Troco confirmado
        ↓
FECHAMENTO
  → Caixa fechado
  → Diferença justificada
  → Incidentes resolvidos
  → PIX conciliado
        ↓
AS 5 PERGUNTAS RESPONDIDAS
```

---

## PENDÊNCIAS OPERACIONAIS

> Esta seção é atualizada conforme o sistema evolui.

- [ ] **Geolocalização** — validar polygon matching com entrega real na Degustti
- [ ] **Módulo Produção** — hoje o pré-preparo é manual, sem registro no sistema
- [ ] **Conciliação automática PIX** — hoje é manual no fechamento
- [ ] **Ficha técnica dos pratos** — cadastrar no Precificador para calcular CMV real
