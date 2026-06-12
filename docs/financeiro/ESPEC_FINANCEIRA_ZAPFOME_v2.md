# ZapFome — Especificação de Regras de Negócio Financeiras

**Versão 2.0 — Junho/2026** (v1.0 revisada pelo parecer do CTO de 12/06/2026)
**Escopo:** restaurantes, deliveries, marmitarias, pizzarias, hamburguerias, padarias e pequenos negócios alimentícios no Brasil.
**Princípio central do documento:** *faturamento ≠ recebimento ≠ lucro ≠ caixa.* Toda regra abaixo existe para que o sistema nunca confunda esses quatro conceitos.

**Changelog v2.0:**
1. §9 — exemplo da DRE recalculado com base única (faturamento líquido), conforme a própria fórmula do §3: margem bruta 68,1%, MC 61,8%, PE ≈ R$ 47.670, margem líquida 9,6%.
2. §4.2 e §16 — esclarecido que a **categoria** da despesa vinculada à saída rápida define sua natureza (fixa/variável); o canal de pagamento (gaveta) não define nada.
3. §7 e §9 — pró-labore fixo entra nos custos fixos e no ponto de equilíbrio; retirada extraordinária de sócio fica fora da despesa operacional.

**Status:** documento norte. Não altera código, schema nem as Costuras 1–3 já implementadas. Prioridades de implementação no §15 subordinadas ao plano P0 operacional vigente.

---

## 1. Glossário Financeiro para Restaurante

| Termo | Definição operacional (como o ZapFome deve tratar) |
|---|---|
| **Faturamento bruto** | Soma do valor de venda de todos os pedidos concluídos no período, antes de qualquer desconto, taxa ou imposto. É competência (data da venda), não caixa. |
| **Faturamento líquido** | Faturamento bruto menos descontos concedidos, cancelamentos/estornos e impostos sobre venda. Ainda não é dinheiro na mão. |
| **Recebimento** | Dinheiro que efetivamente entrou (gaveta, conta bancária, PIX confirmado, repasse de cartão liquidado). É caixa, com data própria, que pode ser diferente da data da venda. |
| **Contas a receber (AR)** | Valores faturados mas ainda não recebidos: cartão não liquidado, fiado em aberto, PIX pendente, vouchers a repassar. |
| **Contas a pagar (AP)** | Obrigações assumidas e ainda não pagas: fornecedores, aluguel, folha, impostos, boletos. |
| **Caixa físico (gaveta)** | Dinheiro em espécie dentro do PDV. Conta própria, separada do banco. |
| **Banco virtual** | Saldo em conta bancária/digital (PIX recebido, repasses de cartão, transferências). Conta própria, separada da gaveta. |
| **Fundo de troco** | Valor em espécie colocado na gaveta na abertura do caixa para dar troco. |
| **Suprimento** | Entrada manual de dinheiro na gaveta fora de venda (ex.: reforço de troco). |
| **Sangria** | Retirada manual de dinheiro da gaveta fora de venda (ex.: levar ao cofre, depósito, pagamento de fornecedor). |
| **Saída rápida** | Pequena despesa paga direto com dinheiro da gaveta (ex.: gelo, gás, motoboy avulso). Tecnicamente é uma sangria com categoria de despesa vinculada. |
| **Diferença de caixa (quebra/sobra)** | Valor contado no fechamento menos o valor esperado calculado pelo sistema. |
| **PIX pendente** | PIX informado pelo cliente/atendente mas ainda não confirmado na conta. **Não é recebido.** |
| **Fiado** | Venda concluída com pagamento prometido para depois. É faturamento + contas a receber. **Nunca é recebimento.** |
| **MDR** | Merchant Discount Rate — taxa percentual que a adquirente desconta de cada venda no cartão. No Brasil varia tipicamente de ~1,3% a ~6% conforme bandeira, modalidade e contrato. |
| **Antecipação de recebíveis** | Receber antes do prazo padrão (crédito = D+30 por parcela) pagando taxa adicional sobre o valor líquido. |
| **D+N** | Convenção de prazo de liquidação: D+0 (mesmo dia), D+1 (dia útil seguinte), D+30 etc. |
| **Conciliação** | Bater o que o sistema diz que deveria entrar com o que de fato entrou (extrato da adquirente, extrato bancário, contagem de gaveta). |
| **CMV** | Custo da Mercadoria Vendida: quanto custou em insumos aquilo que foi vendido no período. Fórmula clássica: Estoque inicial + Compras − Estoque final. |
| **Ficha técnica** | Receita padronizada de um produto com quantidades e custos de cada insumo, rendimento e custo unitário resultante. |
| **Custo variável** | Cresce com a venda: CMV, embalagem, taxa de cartão, comissão de app, imposto sobre venda. |
| **Custo/despesa fixa** | Existe vendendo ou não: aluguel, folha, energia base, sistemas, contador. |
| **Margem bruta** | (Faturamento líquido − CMV) ÷ Faturamento líquido. Referência saudável no setor: 60–75%. |
| **Margem de contribuição** | Receita − todos os custos variáveis (CMV + taxas + embalagem + comissões). É o que sobra para pagar os fixos. |
| **Ponto de equilíbrio** | Faturamento mínimo para a margem de contribuição cobrir os custos fixos (lucro zero). |
| **Lucro bruto** | Faturamento líquido − CMV (em R$). |
| **Lucro líquido** | O que sobra depois de TUDO: CMV, variáveis, fixos, impostos. Referência setor: 8–15% (Sebrae); delivery via marketplace pode cair a 5–10%. |
| **Markup** | Multiplicador aplicado sobre o custo para formar preço. Markup ≠ margem. |
| **Ticket médio** | Faturamento ÷ número de pedidos do período. |
| **DRE** | Demonstrativo de Resultado: relatório por competência que mostra se o negócio deu lucro ou prejuízo no período. |
| **Fluxo de caixa** | Relatório por regime de caixa: entradas e saídas de dinheiro com data real, incluindo projeção futura. |
| **Regime de competência** | Registrar receita/despesa na data do fato gerador (venda, compra). Base da DRE. |
| **Regime de caixa** | Registrar na data em que o dinheiro entra/sai. Base do fluxo de caixa. |
| **Auditoria (trilha)** | Registro imutável de quem fez o quê, quando, e qual era o valor antes/depois. |

---

## 2. Faturado × Recebido × Lucro × Caixa

Os quatro números respondem perguntas diferentes e **vivem em tabelas diferentes**:

| Pergunta | Conceito | Regime | Origem no sistema |
|---|---|---|---|
| "Quanto eu vendi?" | Faturamento | Competência | Pedidos concluídos |
| "Quanto dinheiro entrou?" | Recebimento | Caixa | Liquidações (gaveta + banco) |
| "Quanto eu ganhei?" | Lucro | Competência | DRE (receitas − custos − despesas) |
| "Quanto eu tenho agora?" | Caixa/saldo | Caixa | Saldo das contas (gaveta + banco) |

**Exemplo de um único dia (vai ser reutilizado no documento inteiro):**

Pizzaria vende R$ 1.000 hoje:
- R$ 300 em dinheiro
- R$ 200 em PIX (R$ 150 confirmados, R$ 50 o cliente "disse que mandou")
- R$ 400 no crédito (MDR 4%, liquidação D+30)
- R$ 100 fiado para um cliente conhecido

| Indicador | Valor hoje | Por quê |
|---|---|---|
| Faturamento bruto | R$ 1.000 | tudo foi vendido hoje |
| Recebido hoje | R$ 450 | 300 dinheiro + 150 PIX confirmado |
| Contas a receber | R$ 550 | 400 cartão (líquido futuro R$ 384) + 100 fiado + 50 PIX pendente |
| Caixa físico esperado | fundo de troco + R$ 300 | só dinheiro vai pra gaveta |
| Lucro | só se calcula com CMV e despesas | faturar R$ 1.000 não diz nada sobre lucro |

Se o sistema mostrar "R$ 1.000 recebidos hoje", está **errado** e vai quebrar a confiança do dono no primeiro fechamento.

---

## 3. Fórmulas Oficiais do ZapFome

Convenção: `Σ` = soma no período. Valores monetários em centavos (integer) no banco — *meta de arquitetura; o sistema atual usa DECIMAL(10,2), ver §13.11 e parecer do CTO: não migrar agora.*

```
FATURAMENTO BRUTO       = Σ valor_total dos pedidos com status CONCLUIDO no período (data da venda)
DESCONTOS               = Σ descontos concedidos nos pedidos do período
CANCELAMENTOS/ESTORNOS  = Σ pedidos cancelados após conclusão / devoluções
IMPOSTOS SOBRE VENDA    = FATURAMENTO BRUTO × alíquota efetiva (config do tenant, ex. Simples)
FATURAMENTO LÍQUIDO     = FATURAMENTO BRUTO − DESCONTOS − CANCELAMENTOS − IMPOSTOS SOBRE VENDA

RECEBIDO                = Σ liquidações confirmadas no período
                          (dinheiro na venda + PIX confirmado + repasses de cartão liquidados
                           + fiado quitado + vouchers repassados)

CONTAS A RECEBER        = Σ (faturado − recebido) por título em aberto
                        = cartões não liquidados + fiado em aberto + PIX pendente + vouchers a repassar

CAIXA FÍSICO ESPERADO   = fundo de troco (abertura)
                          + vendas em DINHEIRO da sessão
                          + suprimentos
                          − sangrias
                          − saídas rápidas
                          − trocos de eventuais devoluções em dinheiro

DIFERENÇA DE CAIXA      = valor CONTADO no fechamento − CAIXA FÍSICO ESPERADO
                          (> 0 sobra | < 0 quebra)

CMV (método inventário) = Estoque Inicial + Compras do período − Estoque Final     [R$]
CMV % = CMV ÷ Faturamento (bruto ou líquido — fixar UMA base e exibir qual é)
        Referência Abrasel: 25–40%; faixa usual saudável 28–35%

CMV (método ficha técnica / teórico) = Σ (qtde vendida do produto × custo da ficha técnica)
        → mais simples para MVP; o método inventário entra depois para apurar o CMV real
        → diferença entre os dois = desperdício/desvio (indicador poderoso)

LUCRO BRUTO             = FATURAMENTO LÍQUIDO − CMV                                 [R$]
MARGEM BRUTA %          = LUCRO BRUTO ÷ FATURAMENTO LÍQUIDO × 100
                          Referência: 60–75%

CUSTOS VARIÁVEIS TOTAIS = CMV + taxas de cartão + taxas PIX + comissões de apps
                          + embalagens + impostos sobre venda

MARGEM DE CONTRIBUIÇÃO  = FATURAMENTO LÍQUIDO − CUSTOS VARIÁVEIS (exceto o que já saiu no líquido)
ÍNDICE MC %             = MARGEM DE CONTRIBUIÇÃO ÷ FATURAMENTO LÍQUIDO

PONTO DE EQUILÍBRIO R$  = CUSTOS FIXOS TOTAIS ÷ ÍNDICE MC %
        Ex.: fixos R$ 18.000, MC 45% → precisa faturar R$ 40.000/mês para empatar

LUCRO LÍQUIDO (estimado)= MARGEM DE CONTRIBUIÇÃO − CUSTOS FIXOS − outras despesas
MARGEM LÍQUIDA %        = LUCRO LÍQUIDO ÷ FATURAMENTO LÍQUIDO × 100
        Referência: 8–15% saudável; <5% = zona de risco

TICKET MÉDIO            = FATURAMENTO BRUTO ÷ nº de pedidos concluídos

TAXA DE CARTÃO (custo)  = Σ (valor_bruto_transação × MDR%) + custos de antecipação
VALOR LÍQUIDO CARTÃO    = valor_bruto × (1 − MDR%)
CUSTO ANTECIPAÇÃO       = valor_líquido_parcela × (taxa_antecipação_mensal × dias_antecipados ÷ 30)
        (modelo padrão de mercado: MDR primeiro, antecipação sobre o líquido, pró-rata dia)

TAXA PIX                = valor × taxa% do PSP (muitos bancos = 0 para PJ pequeno; configurável)

CUSTO POR PRODUTO       = Σ (qtde_insumo × custo_unitário_insumo na ficha técnica)
                          + embalagem direta
        custo_unitário_insumo recomendado para MVP: ÚLTIMO PREÇO DE COMPRA
        (alternativa: custo médio ponderado — mais correto, mais complexo; ver §8)

MARKUP                  = PREÇO DE VENDA ÷ CUSTO          (ex.: custo 10, preço 35 → markup 3,5x)
MARGEM ≠ MARKUP:          margem = (35−10)/35 = 71,4%  |  markup 3,5x
```

> **Base única obrigatória:** todos os percentuais da DRE (margem bruta, índice MC, margem líquida) usam **faturamento líquido** como denominador. Exibir a base no rótulo de cada %.

---

## 4. Regras de Caixa (sessão de caixa / gaveta)

A **sessão de caixa** é a entidade central: tudo em espécie acontece dentro de uma sessão.

### 4.1 Abertura

1. Só pode haver **1 sessão aberta por terminal/loja** (MVP: 1 por loja).
2. Operador informa o **fundo de troco** contado fisicamente.
3. Sistema registra: data/hora, operador, valor inicial.
4. Se o fundo informado for diferente do saldo de fechamento anterior da gaveta, o sistema registra automaticamente um **suprimento ou sangria de ajuste** (prática usada por sistemas como Conta Azul) — nunca edita o saldo na mão.
5. Nenhuma venda em dinheiro pode ser registrada sem sessão aberta.

### 4.2 Durante o dia

- Toda venda em **dinheiro** credita a sessão. Cartão e PIX **não** passam pela gaveta (vão para contas a receber/banco).
- **Sangria**: exige valor + motivo (categoria) + responsável. Recomendar limite máximo de gaveta configurável (ex.: R$ 500) — ao atingir, sugerir sangria (segurança contra perda/assalto).
- **Suprimento**: exige valor + origem (cofre/banco/sócio) + responsável.
- **Saída rápida**: é uma sangria **com categoria de despesa obrigatória** (gás, gelo, motoboy, compra de emergência). Gera automaticamente um lançamento de despesa paga (caixa) na mesma operação — assim o dinheiro some da gaveta E aparece na DRE/fluxo. Sem isso, a despesa "evapora".
  **A natureza da despesa (fixa ou variável) vem da CATEGORIA da despesa vinculada, nunca do canal de pagamento.** Pagar pela gaveta não torna a despesa "variável": gás pago em saída rápida é Utilidades (fixa); embalagem comprada em saída rápida é variável. O canal só diz de onde saiu o dinheiro; a categoria diz o que a despesa é.

### 4.3 Regras invioláveis de movimentação

- Sangria/suprimento **só com caixa aberto**.
- Lançamentos **nunca são excluídos nem editados**. Erro? Lançamento de correção no sentido oposto, referenciando o original (padrão de mercado, ex. Conta Azul). Isso é o que torna a auditoria possível.
- Permissão: sangria e suprimento restritos a perfis gerente/dono (configurável). Operador comum só vende.

### 4.4 Fechamento

1. Sistema calcula **caixa físico esperado** (fórmula do §3) — sem mostrar o valor antes da contagem (modo "fechamento cego", configurável; recomendado ON por padrão: o operador conta sem saber quanto "deveria dar").
2. Operador informa o **valor contado** (ideal: por denominação de cédula/moeda — P2).
3. Sistema grava a **diferença** (sobra ou quebra) com assinatura do operador.
4. Diferença ≠ 0 → exige justificativa em texto + gera **alerta** para o dono.
5. Após fechado, a sessão é **imutável**. Correções só na sessão seguinte.
6. Relatório de fechamento mostra: fundo inicial, vendas por forma de pagamento, sangrias, suprimentos, saídas rápidas, cancelamentos, esperado × contado × diferença.

### 4.5 Auditoria

- Toda operação grava: `tenant_id, sessao_id, usuario_id, tipo, valor, motivo, timestamp, ip/dispositivo`.
- Tabela de auditoria é **append-only** (sem UPDATE/DELETE; revogar permissão no Postgres).
- Painel do dono: histórico de diferenças por operador, frequência de sangrias, cancelamentos por operador (padrões anômalos = fraude clássica de balcão).

**Exemplo numérico de fechamento:**

```
Fundo de troco:           R$ 200,00
Vendas em dinheiro:       R$ 300,00
Suprimento (troco extra): R$  50,00
Sangria (cofre):          R$ 250,00 (−)
Saída rápida (gás):       R$  35,00 (−)
ESPERADO:                 R$ 265,00
CONTADO:                  R$ 260,00
DIFERENÇA:                −R$ 5,00 (quebra) → justificar + alerta
```

---

## 5. Regras por Forma de Pagamento

Cada pagamento tem 3 dimensões: **quando vira faturamento**, **quando vira recebimento**, e **para qual conta vai**.

| Forma | Faturamento | Recebimento | Conta destino | Taxa | Observações |
|---|---|---|---|---|---|
| **Dinheiro** | na venda | na venda (imediato) | Gaveta | 0 | única forma que entra na gaveta |
| **PIX confirmado** | na venda | quando confirmado | Banco | 0 ou taxa PSP | confirmação manual (MVP) ou webhook PSP (P1) |
| **PIX pendente** | na venda | **NÃO recebido** | — (AR) | — | status `PENDENTE`; vence em X min/h configurável; cliente "mandou print" não confirma nada |
| **Cartão débito** | na venda | na liquidação (padrão D+1) | Banco | MDR débito (~1–2%) | bruto em AR; líquido entra no banco na conciliação |
| **Cartão crédito** | na venda | na liquidação (padrão **D+30** por parcela; D+0/D+1 só com antecipação contratada) | Banco | MDR crédito (~3–5%) + antecipação | parcelado = N títulos de AR com vencimentos 30/60/90… |
| **Voucher/VR/VA** | na venda | no repasse da operadora (ciclos quinzenais/mensais) | Banco | taxa da operadora (alta, 3–7%) | tratar como AR com prazo do contrato |
| **Fiado** | na venda | **só na quitação** | Gaveta ou Banco (conforme forma da quitação) | 0 | ver §6 |
| **Pagamento parcial/futuro** | na venda (valor total) | parcial agora + saldo em AR | conforme forma | conforme forma | pedido tem N pagamentos; saldo restante = título de AR |

### Regras duras

1. **PIX pendente nunca soma em "recebido"** nem em caixa. Dashboard mostra em card separado.
2. **Cartão nunca é tratado como líquido sem conciliação.** O sistema registra o **bruto** como AR com previsão de liquidação e **taxa estimada** (do cadastro de taxas do tenant). Quando o repasse cai (conciliação manual no MVP, OFX/API depois), o título é baixado pelo **valor real**, e a diferença estimado×real vira ajuste de despesa financeira.
3. Cada tenant cadastra suas **taxas por adquirente/bandeira/modalidade/parcelas** + prazo (D+1, D+30, antecipação automática S/N). Sem cadastro, usar default conservador e marcar como "estimado".
4. Pedido só fecha quando `Σ pagamentos = valor total` OU saldo explícito vai para fiado/AR.
5. **Estorno/cancelamento** após conclusão: gera lançamento negativo de faturamento na data do estorno + reversão do recebimento/AR correspondente. Nunca apagar a venda original.

---

## 6. Fiado e Contas a Receber

Fiado é a maior fonte de "lucro fantasma" do pequeno restaurante: o dono vê venda alta e caixa vazio.

1. Fiado exige **cliente cadastrado** (nome + telefone mínimo). Sem cliente, sem fiado.
2. Cada fiado gera um **título de AR**: valor, data da venda, vencimento (default configurável, ex. 30 dias), pedido de origem.
3. **Limite de fiado por cliente** (configurável, ex. R$ 200) — bloqueio ou alerta ao exceder.
4. Quitação pode ser **total ou parcial**, em qualquer forma de pagamento; cada quitação é um recebimento na data real, na conta correspondente (dinheiro → gaveta da sessão aberta; PIX → banco).
5. Título vencido → status `ATRASADO` → alerta + lista de cobrança (gancho natural para WhatsApp do ZapFome: lembrete automático).
6. Fiado **conta no faturamento e na DRE** do dia da venda (competência), e no fluxo de caixa apenas na quitação.
7. Perdão de dívida/baixa por perda: operação restrita ao dono, gera despesa "inadimplência" (não some o título).
8. Visão consolidada de AR: por origem (cartão / fiado / PIX pendente / voucher), por vencimento (vencendo hoje, 7 dias, atrasados).

---

## 7. Despesas e Contas a Pagar

1. Toda despesa tem: **categoria** (plano de contas simplificado), valor, competência (mês a que se refere), vencimento, status (`A_PAGAR`/`PAGA`), forma e conta de pagamento, fornecedor opcional, anexo (foto da nota — integra com o pipeline de IA do ZapFome).
2. **Plano de contas default** (editável):
   - Custos variáveis: insumos/compras de mercadoria, embalagens, taxas de cartão, comissões de app, impostos sobre venda
   - Pessoal: salários, encargos, benefícios, freelas/extras
   - Ocupação: aluguel, condomínio, IPTU
   - Utilidades: energia, água, gás, internet/telefone
   - Operacional: limpeza, manutenção, marketing, sistemas, contador, motoboy
   - Financeiras: tarifas bancárias, juros, custo de antecipação
   - Sócios: **pró-labore** (remuneração fixa mensal do sócio que trabalha — é custo fixo, entra na DRE e no ponto de equilíbrio) e **retiradas extraordinárias** (distribuição de lucro/saque avulso — **não é despesa operacional**, fica fora da DRE operacional, aparece só no fluxo de caixa como saída de sócio). Separar os dois é obrigatório: misturá-los distorce a DRE e o PE.
3. **Compra de insumo é caso especial**: vira (a) conta a pagar OU saída de caixa/banco, e (b) **entrada de estoque** com quantidades — é o elo entre financeiro e CMV. A nota fotografada no WhatsApp alimenta os dois de uma vez (killer feature do ZapFome).
4. Despesa **recorrente**: gerar títulos futuros automaticamente (aluguel todo dia 5 etc.) — alimenta a projeção do fluxo de caixa.
5. Pagamento baixa o título na data real, na conta real. Pagamento em dinheiro da gaveta = saída rápida (passa pela sessão). A categoria continua sendo a da despesa — o canal gaveta não reclassifica nada (ver §4.2).
6. Marcar cada categoria como **FIXA ou VARIÁVEL** no cadastro — é isso que permite calcular margem de contribuição e ponto de equilíbrio sem esforço do usuário.

---

## 8. Estoque, Ficha Técnica e CMV

### Duas abordagens aceitas no mercado

| Método | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. Ficha técnica (CMV teórico)** | cada venda baixa estoque e soma custo conforme a receita cadastrada | automático, por produto, em tempo real | ignora desperdício, sobra, roubo |
| **B. Inventário (CMV real)** | EI + Compras − EF, com contagem física periódica | é o número verdadeiro; recomendado por Abrasel/iFood/consultorias | exige disciplina de contagem mensal |

**Recomendação MVP: A como motor diário + B mensal como auditoria.** A diferença (CMV real − CMV teórico) é o **índice de perda/desvio** — nenhum concorrente pequeno mostra isso bem.

### Regras

1. **Insumo**: unidade de compra (ex. saco 5 kg) ≠ unidade de uso (g). Cadastrar fator de conversão. Custo unitário = **último preço de compra** (MVP). Custo médio ponderado fica como evolução P2 (mais correto quando preços oscilam, porém exige recalcular a cada entrada: `novo_custo = (saldo_qtde×custo_atual + entrada_qtde×preço_entrada) ÷ (saldo+entrada)`).
2. **Ficha técnica**: lista de insumos + quantidades + % de perda de preparo (ex.: cebola perde 15% na limpeza) + rendimento. Custo do produto = Σ insumos ajustados pela perda + embalagem.
3. Venda concluída → baixa automática dos insumos da ficha. Venda cancelada antes do preparo → estorna baixa; depois do preparo → baixa vira perda.
4. **Compra** (manual ou via foto da nota no WhatsApp) → entrada de estoque + atualização do último preço → recálculo do custo das fichas que usam o insumo → alerta se a margem de algum produto cair abaixo do mínimo.
5. **Estoque mínimo** por insumo → alerta de reposição.
6. **Ajuste de inventário**: contagem física substitui o saldo, diferença vira lançamento de perda/sobra com motivo. Nunca editar saldo direto.
7. CMV% exibido sempre com a base explícita ("CMV sobre faturamento bruto"). Faixas de referência no dashboard: verde ≤ 32%, amarelo 32–38%, vermelho > 38% (calibráveis por segmento: pizzaria/hamburgueria tendem a CMV menor; padaria/marmitaria maior giro).

**Exemplo — X-Burger:**

```
Pão           R$ 1,20
Carne 150g    R$ 4,50   (carne R$ 30/kg)
Queijo 30g    R$ 1,35
Salada/molho  R$ 0,95
Embalagem     R$ 1,00
CUSTO TOTAL   R$ 9,00
Preço venda   R$ 32,00
CMV produto   28,1%  | Markup 3,55x | Margem bruta produto 71,9%
```

---

## 9. DRE Gerencial do Restaurante

Regras:
- **Regime de competência** (venda na data da venda, despesa no mês a que se refere).
- DRE **gerencial**, não contábil — não substitui o contador; orienta decisão.
- Separação variável × fixo é obrigatória (sem ela não existe margem de contribuição nem ponto de equilíbrio — erro clássico de DRE que "engana").
- **Base única de todos os percentuais: faturamento líquido** (conforme §3).
- **Pró-labore** (fixo) entra nos custos fixos e no ponto de equilíbrio. **Retiradas extraordinárias de sócio ficam fora da DRE operacional** — aparecem apenas no fluxo de caixa.

**Estrutura padrão ZapFome:**

```
(=) FATURAMENTO BRUTO
(−) Descontos e cancelamentos
(−) Impostos sobre venda (Simples)
(=) FATURAMENTO LÍQUIDO                     100,0%  ← base de todos os %
(−) CMV                                      ~28–35%
(=) LUCRO BRUTO / MARGEM BRUTA               ~60–75%
(−) Demais variáveis: taxas cartão/PIX, comissões apps, embalagens
(=) MARGEM DE CONTRIBUIÇÃO
(−) Pessoal (salários + encargos)            ~20–30%
(−) Ocupação (aluguel, condomínio)
(−) Utilidades (luz, água, gás, internet)
(−) Operacionais (marketing, sistemas, contador, manutenção)
(=) RESULTADO OPERACIONAL
(−) Despesas financeiras (tarifas, antecipação, juros)
(−) Pró-labore (fixo — entra no PE; exibir destacado)
(=) LUCRO LÍQUIDO                            meta 8–15%

Retiradas extraordinárias de sócio: FORA da DRE — só no fluxo de caixa.
```

**Exemplo mensal (hamburgueria, R$ 60.000/mês) — percentuais sobre faturamento líquido:**

```
Faturamento bruto         60.000
Impostos (Simples ~6%)    −3.600
Faturamento líquido       56.400   100,0%
CMV                      −18.000    31,9%
LUCRO BRUTO               38.400    68,1% margem bruta
Taxas cartão (média 3%)   −1.440
Comissão apps              −900
Embalagens                −1.200
MARGEM DE CONTRIBUIÇÃO    34.860    61,8% (índice MC)
Pessoal                  −15.000
Aluguel                   −4.500
Utilidades                −2.800
Operacionais              −2.600
RESULTADO OPERACIONAL      9.960
Financeiras                −560
Pró-labore                −4.000
LUCRO LÍQUIDO              5.400     9,6%  ✅ dentro da faixa saudável

Custos fixos p/ PE = 15.000 + 4.500 + 2.800 + 2.600 + 560 + 4.000 = 29.460
Ponto de equilíbrio = 29.460 ÷ 0,618 ≈ R$ 47.670/mês (faturamento líquido)
```

---

## 10. Fluxo de Caixa

1. **Regime de caixa**, por conta (Gaveta, Banco 1, Banco 2…), diário.
2. Duas camadas:
   - **Realizado**: tudo que já liquidou.
   - **Projetado**: AR com data prevista (cartão D+30 por parcela, fiado por vencimento, vouchers por ciclo) + AP por vencimento + recorrentes.
3. Saldo projetado do dia = saldo anterior + entradas previstas − saídas previstas. **Saldo projetado negativo em qualquer dia dos próximos 30 → alerta vermelho** ("dia 22 você não terá dinheiro para o aluguel").
4. Transferência gaveta↔banco (sangria com destino banco / suprimento com origem banco) movimenta as duas contas com **um único evento** — nunca dois lançamentos soltos (evita dupla contagem).
5. Conciliação bancária: MVP = marcação manual "caiu/não caiu"; P2 = importação OFX; P3 = API/Open Finance.
6. O fluxo de caixa **não tem CMV, não tem competência** — só dinheiro com data. DRE e fluxo são telas irmãs, nunca a mesma tela.

---

## 11. Dashboard do Dono (leigo)

Princípios: no máximo **5 números na primeira dobra**, linguagem falada, sem jargão sem tooltip, semáforo verde/amarelo/vermelho.

**Primeira dobra (Hoje):**
1. 💰 **Vendi hoje** (faturamento) — vs. mesmo dia semana passada
2. ✅ **Entrou no bolso hoje** (recebido)
3. 🕐 **Tenho a receber** (AR total, com breakdown cartão/fiado/PIX pendente)
4. 🏦 **Quanto tenho agora** (gaveta + banco, separados)
5. 🚦 **Saúde do mês**: lucro estimado até agora + farol da margem líquida

**Segunda dobra (Mês):** faturamento acumulado vs. ponto de equilíbrio ("faltam R$ 12.300 para pagar as contas do mês"), CMV% com farol, top 5 produtos por margem e por volume, ticket médio.

**Regras:**
- Nunca exibir "faturamento" e "recebido" no mesmo card.
- Todo % tem tooltip de uma frase ("CMV = quanto do que você vende vai embora em ingrediente").
- Lucro do mês corrente sempre rotulado **"estimado"** até o fechamento (inventário + conciliação).
- Cards de alerta clicáveis levam direto à ação (lista de fiado atrasado → botão cobrar via WhatsApp).

---

## 12. Alertas

| Alerta | Gatilho (default, configurável) | Severidade |
|---|---|---|
| Diferença de caixa | qualquer fechamento com \|dif\| > R$ 5 ou > 0,5% das vendas em dinheiro | 🔴 imediato (push/WhatsApp ao dono) |
| Diferença recorrente | 3 quebras no mesmo operador em 7 dias | 🔴 |
| PIX pendente | pendente > 30 min | 🟡; > 24 h → 🔴 |
| Fiado atrasado | título vencido | 🟡 diário consolidado; > 15 dias → 🔴 |
| Limite de fiado | cliente atingiu limite | 🟡 no ato da venda |
| Margem baixa de produto | margem bruta do produto < 50% ou CMV produto > 40% (recalcular a cada compra que muda custo) | 🟡 |
| Estoque acabando | saldo ≤ estoque mínimo | 🟡; insumo de top-5 produto → 🔴 |
| Despesa fora do padrão | lançamento > média da categoria + 2 desvios (ou > X% configurável) | 🟡 |
| CMV do mês fora da faixa | CMV% > 38% no parcial do mês | 🔴 |
| Caixa futuro negativo | saldo projetado < 0 nos próximos 30 dias | 🔴 |
| Repasse de cartão não caiu | liquidação prevista D+1/D+30 sem baixa após +2 dias úteis | 🟡 |
| Gaveta acima do limite | saldo da sessão > limite de segurança | 🟡 sugerir sangria |

Canal natural: **WhatsApp** (coerente com o produto). Digest diário às 22h pós-fechamento + alertas vermelhos em tempo real.

---

## 13. O que NÃO Fazer (anti-requisitos)

1. ❌ Somar venda no cartão/fiado/PIX pendente como "dinheiro recebido".
2. ❌ Misturar gaveta e banco num "saldo único" sem breakdown.
3. ❌ Permitir editar ou excluir lançamentos financeiros (só estorno referenciado).
4. ❌ Mostrar lucro sem CMV ("faturamento − despesas pagas" não é lucro).
5. ❌ Tratar valor líquido de cartão como certo antes da conciliação (taxas variam por bandeira/parcela; estimado ≠ real).
6. ❌ Registrar retirada extraordinária do sócio como despesa operacional (distorce a DRE; pró-labore fixo é a exceção — ver §7.2).
7. ❌ Deixar saída rápida sem categoria de despesa (dinheiro que some sem rastro) — e a categoria define a natureza, não o canal (§4.2).
8. ❌ Permitir venda em dinheiro sem sessão de caixa aberta.
9. ❌ Misturar DRE (competência) com fluxo de caixa (caixa) na mesma tela/relatório.
10. ❌ Recalcular histórico quando o custo do insumo muda (custo é congelado na venda; mudanças valem dali pra frente).
11. ❌ Floats para dinheiro. **Integer em centavos**, sempre — *meta para módulos novos; o sistema atual usa DECIMAL(10,2) no banco e não será migrado agora (decisão do parecer de 12/06/2026: o risco real são floats em JS — arredondar nas bordas).* Percentuais com 4 casas.
12. ❌ Esconder a diferença de caixa do operador "para não constranger" — transparência é o controle.
13. ❌ Criar 50 KPIs no dashboard. Dono leigo precisa de 5.

---

## 14. Adaptação Multi-tenant (SaaS)

1. **`tenant_id` (restaurant_id) em TODAS as tabelas financeiras**, incluído em todo índice composto (`(tenant_id, data)`, `(tenant_id, status)`). Padrão já compatível com Express + PostgreSQL raw SQL: middleware injeta tenant do JWT e toda query obriga o filtro (função helper que recusa SQL sem tenant em dev/test).
2. **Configurações por tenant** (tabela `tenant_settings` ou colunas tipadas):
   - alíquota efetiva de imposto, taxas por adquirente/modalidade/parcelas, prazos D+N, antecipação S/N
   - limites: fiado por cliente, gaveta máxima, tolerância de diferença
   - plano de contas custom (a partir do default), faróis de CMV/margem por segmento
   - fechamento cego on/off, permissões de sangria
3. **Ledger imutável compartilhado**: uma tabela `transactions`/`ledger` central (tipo, conta, valor em centavos, referência polimórfica `ref_type/ref_id`, `created_by`) em vez de lógica de saldo espalhada. Saldo = soma do ledger (ou snapshot materializado + ledger incremental). *Meta de arquitetura — o sistema atual usa ledgers especializados (`caixa_movements`, `banco_transactions`, `insumo_movements`) que cumprem os mesmos princípios; não unificar agora.*
4. **Fuso e moeda**: `timezone` por tenant (Brasil tem 4 fusos); todas as datas em UTC no banco, corte de "dia" pelo fuso do tenant. BRL fixo no MVP.
5. **Fechamentos congelados**: ao fechar mês (inventário + conciliação), gravar snapshot da DRE/fluxo por tenant — relatórios históricos não mudam se taxas forem reconfiguradas depois.
6. **Isolamento em jobs**: alertas, digests e recálculos sempre iterando por tenant, com rate limit por tenant no envio de WhatsApp (Evolution API).
7. **Auditoria por tenant**: trilha append-only com `tenant_id`, exportável (LGPD: dado financeiro do restaurante é do restaurante).
8. **Onboarding com defaults de mercado**: o sistema já nasce com plano de contas, taxas típicas (débito 1,5% D+1, crédito à vista 3,5% D+30, etc.) e faróis padrão — o dono ajusta depois. SaaS para leigo não pode exigir configuração antes do primeiro valor.

---

## 15. Prioridade de Implementação

> Subordinada ao plano P0 operacional vigente (PLANO_P0_ESTABILIZACAO) e às Costuras 1–3 já implementadas/aprovadas. Esta lista ordena o que vem DEPOIS.

### P0 — sem isso não existe produto financeiro
- Sessão de caixa: abertura, venda em dinheiro, sangria, suprimento, saída rápida com categoria, fechamento com esperado×contado×diferença
- Formas de pagamento com a separação faturado/recebido: dinheiro, PIX confirmado, PIX pendente, cartão (bruto + taxa estimada + previsão D+N), fiado
- Contas: Gaveta e Banco separadas; ledger imutável (sem edit/delete, só estorno)
- Contas a receber básico (cartão, fiado, PIX pendente) e contas a pagar básico (despesas com categoria fixa/variável)
- Dashboard "Hoje": vendi / entrou / a receber / tenho agora
- Auditoria append-only

### P1 — transforma controle em gestão
- Ficha técnica + estoque com baixa automática → CMV teórico, custo por produto, margem por produto
- DRE gerencial mensal com margem de contribuição e lucro líquido estimado
- Fluxo de caixa realizado + projetado 30 dias (AR/AP por vencimento)
- Alertas: diferença de caixa, fiado atrasado, PIX pendente, estoque mínimo, caixa futuro negativo
- Entrada de compra via foto da nota (WhatsApp + IA) alimentando AP + estoque + custo — **o diferencial do ZapFome**
- Quitação de fiado com cobrança via WhatsApp

### P2 — maturidade financeira
- Conciliação de cartão: importação de extrato da adquirente, baixa pelo valor real, ajuste estimado×real, alerta de repasse não recebido
- Inventário periódico → CMV real × teórico → índice de perda/desvio
- Custo médio ponderado; contagem de gaveta por denominação; fechamento cego configurável
- Ponto de equilíbrio no dashboard ("faltam R$ X para pagar o mês")
- Despesas recorrentes automáticas; multi-conta bancária; importação OFX

### P3 — sofisticação
- Conciliação automática via API/Open Finance e webhooks de PSP (PIX automático)
- Simulador de preço/margem (e se eu subir o burger pra R$ 35?)
- Engenharia de cardápio (matriz popularidade × margem)
- Multi-loja por tenant; DRE comparativa entre lojas; benchmark anônimo entre tenants do mesmo segmento
- Relatórios para o contador (exportação padrão)

---

## 16. Especificação Consolidada — Cenário de Referência

**Dia completo na "Pizzaria do Zé" (tenant configurado: Simples 6%, crédito 4% D+30, débito 1,8% D+1, tolerância de caixa R$ 5, limite fiado R$ 200):**

```
07:50  ABERTURA sessão #341 — fundo de troco R$ 200 (operador: Carla)
12:10  Venda #1001 R$ 90  — dinheiro          → gaveta +90 | faturado +90 | recebido +90
12:30  Venda #1002 R$ 120 — PIX               → cliente mostra comprovante; atendente marca
                                                PIX PENDENTE → AR +120 (não é recebido)
12:34  PIX #1002 confirmado no app do banco   → banco +120 | recebido +120 | AR −120
13:00  Venda #1003 R$ 200 — crédito à vista   → AR +200 (bruto) | previsão líquida R$ 192
                                                em 12/07 (D+30) | taxa estimada R$ 8
13:40  Venda #1004 R$ 60  — fiado (cliente João, saldo atual R$ 80, limite ok)
                                              → AR fiado +60, vence 12/07
15:00  SAÍDA RÁPIDA R$ 35 — categoria "Gás/Utilidades"
                                              → gaveta −35 | despesa paga +35
                                                (natureza: FIXA, definida pela categoria
                                                 Utilidades — não pelo canal gaveta)
17:00  SANGRIA R$ 150 — motivo "cofre"        → gaveta −150 (responsável: Zé)
19:30  Venda #1005 R$ 150 — débito            → AR +150 | previsão líquida R$ 147,30 amanhã (D+1)
22:00  FECHAMENTO sessão #341
       Esperado gaveta = 200 + 90 − 35 − 150 = R$ 105
       Contado = R$ 105 → diferença R$ 0 ✅

RESUMO DO DIA NO DASHBOARD:
  Vendi hoje:            R$ 620,00
  Entrou no bolso:       R$ 210,00  (90 dinheiro + 120 PIX)
  Tenho a receber:       R$ 410,00  (200 crédito + 150 débito + 60 fiado)
  Tenho agora:           Gaveta R$ 105 | Banco R$ 120 (+ saldo anterior)
  Lucro do dia (estimado): faturamento líquido − CMV teórico das vendas − rateio ≈ exibir só no mês

NO DIA SEGUINTE (D+1):
  Repasse débito cai: banco +147,30 | AR −150 | despesa financeira (taxa) +2,70

EM 12/07 (D+30):
  Repasse crédito: previsto 192,00; caiu 191,40 → baixa 200 de AR, taxa real 8,60,
  ajuste de estimativa −0,60 lançado em despesas financeiras. Conciliado ✅
```

---

## Referências consultadas

- Abrasel (via Abrahão/Goomer): faixa de CMV 25–40% — abrahao.com.br/blog/administracao/cmv-restaurante
- OlaClick — CMV restaurante, faixas 28–35% e fórmula EI+Compras−EF — olaclick.com/financeiro/cmv-restaurante
- Blog de Parceiros iFood — CMV pelo método de variação de estoque e ficha técnica — blog-parceiros.ifood.com.br/cmv
- Stone — CMV por produto e ficha técnica — conteudo.stone.com.br/o-que-e-cmv-restaurante-como-calcular
- Conta Azul — regras de suprimento/sangria (só com caixa aberto, sem exclusão, ajuste automático na abertura) — ajuda.contaazul.com (Frente de caixa PDV)
- Gálago — abertura/fechamento de caixa, saldo esperado, boas práticas de sangria — galago.com.br/blog
- Cielo — fluxo de recebimento no crédito (autorização → liquidação no prazo contratado) — blog.cielo.com.br
- MaquinaTop / Concil / Pagar.me — prazos D+0/D+1/D+30, MDR e cálculo de antecipação pró-rata sobre o líquido
- Dattos — auditoria de MDR e conciliação de adquirentes; MDR no Brasil ~1,3% a 5,9%
- Sebrae (via Facilyta) — lucro líquido típico de restaurantes 8–15%
- GrandChef / Comandaz / SisFood — margens líquidas por segmento; delivery via marketplace 5–10%
- MaxUp — separação variável×fixo na DRE gerencial, margem de contribuição e ponto de equilíbrio
- Marcelo Politi — estrutura de % alvo (CMV 25 / variáveis 10 / mão de obra 25 / fixos / lucro 15)
