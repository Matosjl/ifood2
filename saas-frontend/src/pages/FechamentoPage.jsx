import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => n != null ? `${n}%` : '—';

function Bloco({ titulo, children, cor = 'gray' }) {
  const bordas = { gray: 'border-white/[0.06]', green: 'border-green-500/20', red: 'border-red-500/20', yellow: 'border-yellow-500/20', blue: 'border-blue-500/20' };
  return (
    <div className={`bg-gray-800/40 rounded-2xl p-4 border ${bordas[cor] ?? bordas.gray} space-y-3`}>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{titulo}</p>
      {children}
    </div>
  );
}

function Linha({ label, valor, destaque, cor }) {
  const cores = { verde: 'text-green-400', vermelho: 'text-red-400', amarelo: 'text-yellow-400', cinza: 'text-gray-400' };
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${destaque ? (cores[cor] ?? 'text-gray-100') : 'text-gray-200'}`}>{valor}</span>
    </div>
  );
}

function Criterio({ ok, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-base ${ok ? 'text-green-400' : 'text-red-400'}`}>{ok ? '✅' : '❌'}</span>
      <span className={`text-sm ${ok ? 'text-gray-300' : 'text-red-300'}`}>{label}</span>
    </div>
  );
}

// ── Fechamento Diário (aba Hoje) ──────────────────────────────
function FechamentoDiario() {
  const [dados,      setDados]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState(null);
  const [atualizado, setAtualizado] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const { data } = await api.get('/operacao/fechamento-hoje');
      setDados(data.data);
      setAtualizado(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { setErro(e.response?.data?.message ?? 'Erro ao carregar fechamento.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (erro)    return <div className="p-6 text-center text-red-400 bg-red-400/10 rounded-2xl">{erro}</div>;
  if (!dados)  return null;

  const { vendas, logistica, caixa, despesas, cmv, lucro_estimado, incidentes, estoque, confiabilidade } = dados;
  const confiavel = confiabilidade.dia_confiavel;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-black text-gray-100">📋 Fechamento do Dia</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <button onClick={carregar} className="text-xs text-gray-500 hover:text-orange-400 transition-colors flex items-center gap-1">
          🔄 {atualizado ?? '—'}
        </button>
      </div>

      {/* Confiabilidade */}
      <div className={`rounded-2xl p-4 border ${confiavel ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-bold text-gray-200">{confiavel ? '✅ Dia confiável' : '⚠️ Divergências encontradas'}</p>
          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${confiavel ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {confiabilidade.score}/{confiabilidade.score_total}
          </span>
        </div>
        <div className="space-y-1.5">
          <Criterio ok={confiabilidade.criterios.caixa_conciliado}          label="Caixa conciliado" />
          <Criterio ok={confiabilidade.criterios.todos_pedidos_com_custo}   label="Todos os pedidos com custo cadastrado" />
          <Criterio ok={confiabilidade.criterios.sem_falha_deducao_insumos} label="Sem falha na dedução de insumos" />
          <Criterio ok={confiabilidade.criterios.todos_insumos_deduziram}   label="Insumos deduziram em todos os pedidos" />
          <Criterio ok={confiabilidade.criterios.sem_divergencia_caixa}     label="Sem divergência de caixa" />
        </div>
      </div>

      <Bloco titulo="💰 Vendas">
        <Linha label="Pedidos" valor={vendas.total_pedidos} />
        <Linha label="Faturamento (c/ entrega)" valor={fmt(vendas.faturamento)} />
        {(vendas.total_fiado > 0) && (
          <Linha label="🤝 Fiado (a receber)" valor={`-${fmt(vendas.total_fiado)}`} cor="amarelo" destaque />
        )}
        {(vendas.total_fiado > 0) && (
          <Linha label="✅ Receita efetiva" valor={fmt(vendas.receita_efetiva)} destaque cor="verde" />
        )}
        <Linha label="Receita produtos" valor={fmt(vendas.receita_produtos)} destaque={!vendas.total_fiado} cor="verde" />
        <Linha label="Ticket médio" valor={fmt(vendas.ticket_medio)} />
        <Linha label="Cancelados" valor={vendas.pedidos_cancelados} cor="vermelho" destaque={vendas.pedidos_cancelados > 0} />
        <div className="flex gap-3 pt-1 border-t border-white/[0.04]">
          <span className="text-xs text-gray-500">🚚 {vendas.por_canal.entrega} entrega</span>
          <span className="text-xs text-gray-500">🏃 {vendas.por_canal.retirada} retirada</span>
          <span className="text-xs text-gray-500">🍽️ {vendas.por_canal.mesa} mesa</span>
        </div>
      </Bloco>

      <Bloco titulo="🛵 Logística">
        <Linha label="Taxas cobradas" valor={fmt(logistica.taxas_cobradas)} />
        <Linha label="Repasse motoboy" valor={`-${fmt(logistica.repasse_motoboy)}`} cor="vermelho" destaque />
        <Linha label="Resultado logística" valor={fmt(logistica.resultado)} destaque cor={logistica.resultado >= 0 ? 'verde' : 'vermelho'} />
      </Bloco>

      <Bloco titulo="📊 CMV e Custo" cor={cmv.aviso_cobertura ? 'yellow' : 'gray'}>
        <Linha label="Custo total (CMV)" valor={fmt(cmv.custo_total)} />
        <Linha label="CMV %" valor={pct(cmv.cmv_pct)} destaque cor={cmv.cmv_pct != null && cmv.cmv_pct > 40 ? 'vermelho' : 'verde'} />
        <Linha label="Cobertura de custo" valor={`${cmv.cobertura_pct}% dos pedidos`} destaque cor={cmv.cobertura_pct < 80 ? 'amarelo' : 'verde'} />
        <Linha label="Margem bruta" valor={fmt(cmv.margem_bruta)} destaque cor="verde" />
        {cmv.aviso_cobertura && <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">⚠️ {cmv.aviso_cobertura}</p>}
      </Bloco>

      <Bloco titulo="🏧 Caixa" cor={caixa.status === 'closed' ? (Math.abs(caixa.discrepancy) > 0.01 ? 'red' : 'green') : 'yellow'}>
        <Linha label="Status" valor={caixa.status === 'closed' ? '✅ Fechado' : caixa.status === 'open' ? '🟡 Aberto' : '—'} />
        {caixa.status === 'closed' && <>
          <Linha label="Total registrado" valor={fmt(caixa.total_revenue)} />
          <Linha label="Total contado" valor={fmt(caixa.total_contado)} />
          <Linha label="Diferença" valor={fmt(caixa.discrepancy)} destaque cor={Math.abs(caixa.discrepancy) > 0.01 ? 'vermelho' : 'verde'} />
        </>}
        {caixa.status === 'open'       && <p className="text-xs text-yellow-400">Caixa ainda aberto — feche ao encerrar o dia.</p>}
        {caixa.status === 'nao_aberto' && <p className="text-xs text-gray-500">Nenhum caixa aberto hoje.</p>}
      </Bloco>

      <Bloco titulo="💸 Despesas">
        <Linha label="Total vencendo hoje" valor={fmt(despesas.total)} />
        <Linha label="Pagas" valor={fmt(despesas.pagas)} destaque cor="verde" />
        <Linha label="Pendentes" valor={fmt(despesas.pendentes)} destaque cor={despesas.pendentes > 0 ? 'vermelho' : 'verde'} />
      </Bloco>

      <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500/20">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400 font-semibold">Lucro estimado</p>
          <p className={`text-2xl font-black tabular-nums ${lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(lucro_estimado)}</p>
        </div>
        {cmv.cobertura_pct < 100 && (
          <p className="text-xs text-gray-600 mt-1">* Estimativa parcial ({cmv.cobertura_pct}% dos pedidos com custo cadastrado)</p>
        )}
      </div>

      {incidentes.total > 0 && (
        <Bloco titulo="⚠️ Incidentes" cor={incidentes.abertos > 0 ? 'red' : 'gray'}>
          <Linha label="Total" valor={incidentes.total} />
          <Linha label="Abertos" valor={incidentes.abertos} destaque cor={incidentes.abertos > 0 ? 'vermelho' : 'verde'} />
          <Linha label="Custo abertos" valor={fmt(incidentes.custo_abertos)} cor="vermelho" destaque={incidentes.custo_abertos > 0} />
          {incidentes.troco_pendente    > 0 && <Linha label="Trocos pendentes"    valor={incidentes.troco_pendente}    cor="amarelo" destaque />}
          {incidentes.pedidos_esquecidos > 0 && <Linha label="Pedidos esquecidos" valor={incidentes.pedidos_esquecidos} cor="vermelho" destaque />}
          {incidentes.deducao_falhou    > 0 && <Linha label="Falhas de dedução"   valor={incidentes.deducao_falhou}    cor="vermelho" destaque />}
        </Bloco>
      )}

      {estoque.itens_abaixo_minimo > 0 && (
        <Bloco titulo={`📦 Estoque Baixo (${estoque.itens_abaixo_minimo})`} cor="yellow">
          {estoque.alertas.map((i) => (
            <div key={i.id} className="flex justify-between items-center">
              <span className="text-sm text-gray-300">{i.name}</span>
              <span className="text-xs text-yellow-400 tabular-nums">
                {parseFloat(i.qty_in_stock).toFixed(2)} / mín {parseFloat(i.min_qty).toFixed(2)} {i.unit}
              </span>
            </div>
          ))}
        </Bloco>
      )}
    </div>
  );
}

// ── Semáforo de cobertura CMV ─────────────────────────────────
function SemaforoCMV({ pct: cobertura }) {
  const cor   = cobertura > 90 ? 'text-green-400'  : cobertura >= 70 ? 'text-yellow-400' : 'text-red-400';
  const emoji = cobertura > 90 ? '🟢'              : cobertura >= 70 ? '🟡'              : '🔴';
  const label = cobertura > 90 ? 'Cobertura boa'   : cobertura >= 70 ? 'Cobertura parcial' : 'Cobertura baixa';
  return (
    <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
      <span className="text-sm text-gray-400">Cobertura de custo</span>
      <span className={`text-sm font-black tabular-nums ${cor}`}>
        {emoji} {cobertura}% <span className="text-xs font-normal opacity-70">— {label}</span>
      </span>
    </div>
  );
}

// ── Fechamento Mensal (aba Mensal) ────────────────────────────
function FechamentoMensal() {
  const hoje      = new Date();
  const mesAtual  = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [month,   setMonth]   = useState(mesAtual);
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro,    setErro]    = useState(null);

  const carregar = useCallback(async (m) => {
    setLoading(true); setErro(null); setDados(null);
    try {
      const { data } = await api.get(`/operacao/fechamento-mensal?month=${m}`);
      setDados(data.data);
    } catch (e) { setErro(e.response?.data?.message ?? 'Erro ao carregar fechamento mensal.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(month); }, [carregar, month]);

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next <= mesAtual) setMonth(next);
  };

  const nomeMes = (m) => new Date(`${m}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Seletor de mês */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">←</button>
        <div className="text-center">
          <h2 className="text-lg font-black text-gray-100 capitalize">📅 {nomeMes(month)}</h2>
          {dados && <p className="text-xs text-gray-500 mt-0.5">{dados.periodo.data_inicio} → {dados.periodo.data_fim}</p>}
        </div>
        <button onClick={nextMonth} disabled={month >= mesAtual}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">→</button>
      </div>

      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}
      {erro    && <div className="p-4 text-center text-red-400 bg-red-400/10 rounded-2xl">{erro}</div>}
      {!loading && !erro && !dados && (
        <div className="p-8 text-center text-gray-500 bg-gray-800/30 rounded-2xl">
          <p className="text-2xl mb-2">📭</p>
          <p className="text-sm">Nenhum dado encontrado para este mês.</p>
        </div>
      )}

      {dados && (() => {
        const { vendas, por_pagamento, fiado, cmv, despesas, caixa, incidentes, confiabilidade, lucro_estimado } = dados;

        return (
          <>
            {/* ── Cards de resumo ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06]">
                <p className="text-xs text-gray-500 mb-1">Faturamento</p>
                <p className="text-xl font-black text-gray-100">{fmt(vendas.faturamento)}</p>
                <p className="text-xs text-gray-500 mt-1">{vendas.total_pedidos} pedidos</p>
              </div>
              <div className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06]">
                <p className="text-xs text-gray-500 mb-1">Resultado Estimado</p>
                <p className={`text-xl font-black ${(lucro_estimado ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(lucro_estimado ?? 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Receita − CMV − Desp. − Log.</p>
              </div>
              <div className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06]">
                <p className="text-xs text-gray-500 mb-1">Ticket Médio</p>
                <p className="text-xl font-black text-gray-100">{fmt(vendas.ticket_medio)}</p>
              </div>
              <div className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06]">
                <p className="text-xs text-gray-500 mb-1">CMV %</p>
                <p className={`text-xl font-black ${cmv.cmv_pct != null && cmv.cmv_pct > 40 ? 'text-red-400' : 'text-green-400'}`}>
                  {pct(cmv.cmv_pct)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {cmv.cobertura_pct > 90 ? '🟢' : cmv.cobertura_pct >= 70 ? '🟡' : '🔴'} Cobertura {cmv.cobertura_pct}%
                </p>
              </div>
            </div>

            {/* ── Vendas detalhado ── */}
            <Bloco titulo="💰 Vendas">
              <Linha label="Faturamento bruto"    valor={fmt(vendas.faturamento)} />
              <Linha label="Receita de produtos"  valor={fmt(vendas.receita_produtos)} destaque cor="verde" />
              <Linha label="Taxas de entrega"     valor={fmt(vendas.taxas_entrega)} />
              <Linha label="Repasse motoboy"      valor={`-${fmt(vendas.repasse_motoboy)}`} cor="vermelho" destaque />
              <Linha label="Resultado logística"  valor={fmt(vendas.resultado_logistica)}
                destaque cor={vendas.resultado_logistica >= 0 ? 'verde' : 'vermelho'} />
              <Linha label="Ticket médio"         valor={fmt(vendas.ticket_medio)} />
              <Linha label="Pedidos cancelados"   valor={vendas.pedidos_cancelados}
                cor="vermelho" destaque={vendas.pedidos_cancelados > 0} />
              <div className="flex gap-3 pt-1 border-t border-white/[0.04]">
                <span className="text-xs text-gray-500">🚚 {vendas.por_canal.entrega} entrega</span>
                <span className="text-xs text-gray-500">🏃 {vendas.por_canal.retirada} retirada</span>
                <span className="text-xs text-gray-500">🍽️ {vendas.por_canal.mesa} mesa</span>
              </div>
            </Bloco>

            {/* ── Por forma de pagamento ── */}
            <Bloco titulo="💳 Por Forma de Pagamento">
              <Linha label="Dinheiro" valor={`${fmt(por_pagamento.dinheiro.total)} (${por_pagamento.dinheiro.qtd})`} />
              <Linha label="PIX"      valor={`${fmt(por_pagamento.pix.total)} (${por_pagamento.pix.qtd})`} />
              <Linha label="Cartão"   valor={`${fmt(por_pagamento.cartao.total)} (${por_pagamento.cartao.qtd})`} />
              <Linha label="Fiado"
                valor={`${fmt(por_pagamento.fiado.total)} (${por_pagamento.fiado.qtd})`}
                cor={por_pagamento.fiado.total > 0 ? 'amarelo' : undefined}
                destaque={por_pagamento.fiado.total > 0} />
              {por_pagamento.outros.qtd > 0 && (
                <Linha label="Outros" valor={`${fmt(por_pagamento.outros.total)} (${por_pagamento.outros.qtd})`} />
              )}
            </Bloco>

            {/* ── Fiado ── */}
            {(fiado.vendido_mes > 0 || fiado.saldo_pendente_global > 0) && (
              <Bloco titulo="📒 Fiado" cor={fiado.pendente_do_periodo > 0 ? 'yellow' : 'gray'}>
                {/* Seção do período */}
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Deste mês</p>
                <Linha label="Vendido no mês (fiado)"
                  valor={fmt(fiado.vendido_mes)} />
                <Linha label="Pago no período"
                  valor={fmt(fiado.pago_no_periodo)} destaque cor="verde" />
                <Linha label="Pendente do período"
                  valor={fmt(fiado.pendente_do_periodo)}
                  destaque cor={fiado.pendente_do_periodo > 0 ? 'vermelho' : 'verde'} />

                {/* Saldo global */}
                {fiado.saldo_pendente_global > 0 && (
                  <div className="pt-2 border-t border-white/[0.04]">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Saldo total a receber</p>
                    <div className="flex items-center justify-between bg-yellow-400/5 border border-yellow-500/20 rounded-xl px-3 py-2">
                      <span className="text-sm text-gray-400">Total pendente (todos os meses)</span>
                      <span className="text-sm font-black text-yellow-400 tabular-nums">{fmt(fiado.saldo_pendente_global)}</span>
                    </div>
                  </div>
                )}

                {/* Clientes pendentes */}
                {fiado.clientes_pendentes?.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
                    <p className="text-xs text-gray-500 font-semibold">Clientes com saldo pendente</p>
                    {fiado.clientes_pendentes.map((c, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-sm text-gray-300 truncate max-w-[60%]">{c.nome}</span>
                        <span className="text-sm font-bold text-yellow-400 tabular-nums">{fmt(c.saldo_pendente)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Bloco>
            )}

            {/* ── CMV e Custo ── */}
            <Bloco titulo="📊 CMV e Custo" cor={cmv.aviso_cobertura ? 'yellow' : 'gray'}>
              <Linha label="Receita de produtos" valor={fmt(cmv.receita_produtos)} />
              <Linha label="Custo dos produtos"  valor={fmt(cmv.custo_total)} />
              <Linha label="CMV %"
                valor={pct(cmv.cmv_pct)}
                destaque cor={cmv.cmv_pct != null && cmv.cmv_pct > 40 ? 'vermelho' : 'verde'} />
              <Linha label="Lucro bruto" valor={fmt(cmv.lucro_bruto)} destaque cor="verde" />

              {/* Semáforo */}
              <SemaforoCMV pct={cmv.cobertura_pct} />

              {/* Três métricas de cobertura */}
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Completo</p>
                  <p className="text-base font-black text-green-400">{cmv.pedidos_com_custo_completo ?? '—'}</p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Parcial</p>
                  <p className="text-base font-black text-yellow-400">{cmv.pedidos_com_custo_parcial ?? '—'}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Sem custo</p>
                  <p className="text-base font-black text-red-400">{cmv.pedidos_sem_custo ?? '—'}</p>
                </div>
              </div>

              {cmv.aviso_cobertura && (
                <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">⚠️ {cmv.aviso_cobertura}</p>
              )}
            </Bloco>

            {/* ── Despesas ── */}
            <Bloco titulo="💸 Despesas" cor={despesas.pendentes > 0 ? 'red' : 'gray'}>
              <Linha label="Total do mês" valor={fmt(despesas.total)} />
              <Linha label="Pagas"        valor={fmt(despesas.pagas)} destaque cor="verde" />
              <Linha label="Pendentes"    valor={fmt(despesas.pendentes)}
                destaque cor={despesas.pendentes > 0 ? 'vermelho' : 'verde'} />
              {despesas.por_categoria?.length > 0 && (
                <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
                  {despesas.por_categoria.map((c, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-sm text-gray-400 truncate">{c.category}</span>
                      <span className="text-sm font-semibold text-gray-200 tabular-nums">{fmt(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Bloco>

            {/* ── Resultado Estimado (breakdown) ── */}
            <div className="bg-gray-900 rounded-2xl border border-orange-500/20 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">📈 Resultado Estimado</p>

                {/* Linhas de composição */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Receita de produtos</span>
                    <span className="text-sm font-semibold text-gray-200 tabular-nums">+ {fmt(cmv.receita_produtos)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Resultado logística</span>
                    <span className={`text-sm font-semibold tabular-nums ${vendas.resultado_logistica >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {vendas.resultado_logistica >= 0 ? '+' : ''}{fmt(vendas.resultado_logistica)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">CMV (custo produtos)</span>
                    <span className="text-sm font-semibold text-red-400 tabular-nums">− {fmt(cmv.custo_total)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Despesas pagas</span>
                    <span className="text-sm font-semibold text-red-400 tabular-nums">− {fmt(despesas.pagas)}</span>
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="mt-2 mx-4 mb-4 flex justify-between items-center pt-3 border-t border-white/[0.06]">
                <span className="text-sm text-gray-400 font-semibold">Lucro estimado</span>
                <span className={`text-2xl font-black tabular-nums ${(lucro_estimado ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(lucro_estimado ?? 0)}
                </span>
              </div>

              {/* Aviso cobertura parcial */}
              {cmv.cobertura_pct < 100 && (
                <p className="px-4 pb-3 text-xs text-gray-600">
                  * CMV baseado em {cmv.cobertura_pct}% dos pedidos com custo completo — lucro pode estar subestimado.
                </p>
              )}
            </div>

            {/* ── Caixa ── */}
            <Bloco titulo="🏧 Caixa" cor={caixa.fechamentos_com_divergencia > 0 ? 'red' : 'green'}>
              <Linha label="Fechamentos no mês"    valor={caixa.total_fechamentos} />
              <Linha label="Com divergência"       valor={caixa.fechamentos_com_divergencia}
                destaque cor={caixa.fechamentos_com_divergencia > 0 ? 'vermelho' : 'verde'} />
              <Linha label="Total de divergências" valor={fmt(caixa.divergencias_total)}
                destaque cor={caixa.divergencias_total > 0 ? 'vermelho' : 'verde'} />
              <Linha label="Sangrias"              valor={fmt(caixa.sangrias)}
                cor="amarelo" destaque={caixa.sangrias > 0} />
              <Linha label="Suprimentos"           valor={fmt(caixa.suprimentos)} />
              <Linha label="Saídas rápidas"        valor={fmt(caixa.saidas_rapidas)}
                cor="amarelo" destaque={caixa.saidas_rapidas > 0} />
            </Bloco>

            {/* ── Incidentes ── */}
            {incidentes.total > 0 && (
              <Bloco titulo="⚠️ Incidentes" cor={incidentes.abertos > 0 ? 'red' : 'gray'}>
                <Linha label="Total do mês"      valor={incidentes.total} />
                <Linha label="Ainda abertos"     valor={incidentes.abertos}
                  destaque cor={incidentes.abertos > 0 ? 'vermelho' : 'verde'} />
                <Linha label="Prejuízo estimado" valor={fmt(incidentes.prejuizo_estimado)}
                  destaque cor={incidentes.prejuizo_estimado > 0 ? 'vermelho' : 'cinza'} />
                <div className="pt-2 border-t border-white/[0.04] space-y-1">
                  {incidentes.por_tipo.cash_difference > 0   && <Linha label="Divergências de caixa" valor={incidentes.por_tipo.cash_difference}   cor="vermelho" destaque />}
                  {incidentes.por_tipo.deducao_falhou > 0    && <Linha label="Falhas de dedução"      valor={incidentes.por_tipo.deducao_falhou}    cor="vermelho" destaque />}
                  {incidentes.por_tipo.sangria_excessiva > 0 && <Linha label="Sangrias excessivas"    valor={incidentes.por_tipo.sangria_excessiva} cor="amarelo"  destaque />}
                  {incidentes.por_tipo.cancelamentos > 0     && <Linha label="Cancelamentos"          valor={incidentes.por_tipo.cancelamentos}     />}
                </div>
              </Bloco>
            )}

            {/* ── Confiabilidade Mensal ── */}
            <Bloco titulo="🔍 Confiabilidade Mensal">
              <Linha label="Dias com venda"       valor={confiabilidade.dias_com_venda} />
              <Linha label="Dias sem divergência" valor={confiabilidade.dias_sem_divergencia}
                destaque cor={confiabilidade.dias_sem_divergencia === confiabilidade.dias_com_venda ? 'verde' : 'amarelo'} />
              <Linha label="Pedidos sem dedução"  valor={confiabilidade.pedidos_sem_deducao}
                destaque cor={confiabilidade.pedidos_sem_deducao > 0 ? 'amarelo' : 'verde'} />

              {/* Breakdown de custo — consistente com CMV */}
              <div className="pt-2 border-t border-white/[0.04]">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Cobertura de custo (pedidos)</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl py-2">
                    <p className="text-xs text-gray-500 mb-0.5">Custo completo</p>
                    <p className="text-base font-black text-green-400">{cmv.pedidos_com_custo_completo ?? '—'}</p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2">
                    <p className="text-xs text-gray-500 mb-0.5">Custo parcial</p>
                    <p className="text-base font-black text-yellow-400">{cmv.pedidos_com_custo_parcial ?? '—'}</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-2">
                    <p className="text-xs text-gray-500 mb-0.5">Sem custo</p>
                    <p className="text-base font-black text-red-400">{confiabilidade.pedidos_sem_custo ?? '—'}</p>
                  </div>
                </div>
              </div>
            </Bloco>
          </>
        );
      })()}
    </div>
  );
}

// ── Página principal com tabs ─────────────────────────────────
export default function FechamentoPage() {
  const [tab, setTab] = useState('hoje');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tabs sticky — fixas no topo, não scrollam com o conteúdo */}
      <div className="shrink-0 px-4 pt-4 pb-2 bg-gray-950/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-1 bg-gray-800/60 p-1 rounded-xl">
            {[{ id: 'hoje', label: '📋 Hoje' }, { id: 'mensal', label: '📅 Mensal' }].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === t.id ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conteúdo com scroll independente */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-6">
          {tab === 'hoje'   && <FechamentoDiario />}
          {tab === 'mensal' && <FechamentoMensal />}
        </div>
      </div>
    </div>
  );
}
