import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const fmt  = (n) => `R$ ${parseFloat(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct  = (n) => n != null ? `${n}%` : '—';

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

export default function FechamentoPage() {
  const [dados,    setDados]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [erro,     setErro]     = useState(null);
  const [atualizado, setAtualizado] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data } = await api.get('/operacao/fechamento-hoje');
      setDados(data.data);
      setAtualizado(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setErro(e.response?.data?.message ?? 'Erro ao carregar fechamento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (erro) return (
    <div className="p-6 text-center text-red-400 bg-red-400/10 rounded-2xl m-4">{erro}</div>
  );

  if (!dados) return null;

  const { vendas, logistica, caixa, despesas, cmv, lucro_estimado, incidentes, estoque, confiabilidade } = dados;
  const confiavel = confiabilidade.dia_confiavel;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

      {/* Cabeçalho */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-black text-gray-100">📋 Fechamento do Dia</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <button onClick={carregar}
          className="text-xs text-gray-500 hover:text-orange-400 transition-colors flex items-center gap-1">
          🔄 {atualizado ?? '—'}
        </button>
      </div>

      {/* Confiabilidade — destaque visual */}
      <div className={`rounded-2xl p-4 border ${confiavel ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-bold text-gray-200">
            {confiavel ? '✅ Dia confiável' : '⚠️ Divergências encontradas'}
          </p>
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

      {/* Vendas */}
      <Bloco titulo="💰 Vendas">
        <Linha label="Pedidos" valor={vendas.total_pedidos} />
        <Linha label="Faturamento (c/ entrega)" valor={fmt(vendas.faturamento)} />
        <Linha label="Receita produtos" valor={fmt(vendas.receita_produtos)} destaque cor="verde" />
        <Linha label="Ticket médio" valor={fmt(vendas.ticket_medio)} />
        <Linha label="Cancelados" valor={vendas.pedidos_cancelados} cor="vermelho" destaque={vendas.pedidos_cancelados > 0} />
        <div className="flex gap-3 pt-1 border-t border-white/[0.04]">
          <span className="text-xs text-gray-500">🚚 {vendas.por_canal.entrega} entrega</span>
          <span className="text-xs text-gray-500">🏃 {vendas.por_canal.retirada} retirada</span>
          <span className="text-xs text-gray-500">🍽️ {vendas.por_canal.mesa} mesa</span>
        </div>
      </Bloco>

      {/* Logística */}
      <Bloco titulo="🛵 Logística">
        <Linha label="Taxas cobradas" valor={fmt(logistica.taxas_cobradas)} />
        <Linha label="Repasse motoboy" valor={`-${fmt(logistica.repasse_motoboy)}`} cor="vermelho" destaque />
        <Linha label="Resultado logística" valor={fmt(logistica.resultado)}
          destaque cor={logistica.resultado >= 0 ? 'verde' : 'vermelho'} />
      </Bloco>

      {/* CMV */}
      <Bloco titulo="📊 CMV e Custo" cor={cmv.aviso_cobertura ? 'yellow' : 'gray'}>
        <Linha label="Custo total (CMV)" valor={fmt(cmv.custo_total)} />
        <Linha label="CMV %" valor={pct(cmv.cmv_pct)} destaque
          cor={cmv.cmv_pct != null && cmv.cmv_pct > 40 ? 'vermelho' : 'verde'} />
        <Linha label="Cobertura de custo" valor={`${cmv.cobertura_pct}% dos pedidos`}
          destaque cor={cmv.cobertura_pct < 80 ? 'amarelo' : 'verde'} />
        <Linha label="Margem bruta" valor={fmt(cmv.margem_bruta)} destaque cor="verde" />
        {cmv.aviso_cobertura && (
          <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">⚠️ {cmv.aviso_cobertura}</p>
        )}
      </Bloco>

      {/* Caixa */}
      <Bloco titulo="🏧 Caixa" cor={caixa.status === 'closed' ? (Math.abs(caixa.discrepancy) > 0.01 ? 'red' : 'green') : 'yellow'}>
        <Linha label="Status" valor={
          caixa.status === 'closed' ? '✅ Fechado' :
          caixa.status === 'open'   ? '🟡 Aberto' : '—'} />
        {caixa.status === 'closed' && <>
          <Linha label="Total registrado" valor={fmt(caixa.total_revenue)} />
          <Linha label="Total contado" valor={fmt(caixa.total_contado)} />
          <Linha label="Diferença" valor={fmt(caixa.discrepancy)}
            destaque cor={Math.abs(caixa.discrepancy) > 0.01 ? 'vermelho' : 'verde'} />
        </>}
        {caixa.status === 'open' && (
          <p className="text-xs text-yellow-400">Caixa ainda aberto — feche ao encerrar o dia.</p>
        )}
        {caixa.status === 'nao_aberto' && (
          <p className="text-xs text-gray-500">Nenhum caixa aberto hoje.</p>
        )}
      </Bloco>

      {/* Despesas */}
      <Bloco titulo="💸 Despesas">
        <Linha label="Total vencendo hoje" valor={fmt(despesas.total)} />
        <Linha label="Pagas" valor={fmt(despesas.pagas)} destaque cor="verde" />
        <Linha label="Pendentes" valor={fmt(despesas.pendentes)}
          destaque cor={despesas.pendentes > 0 ? 'vermelho' : 'verde'} />
      </Bloco>

      {/* Lucro estimado */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500/20">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400 font-semibold">Lucro estimado</p>
          <p className={`text-2xl font-black tabular-nums ${lucro_estimado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmt(lucro_estimado)}
          </p>
        </div>
        {cmv.cobertura_pct < 100 && (
          <p className="text-xs text-gray-600 mt-1">* Estimativa parcial ({cmv.cobertura_pct}% dos pedidos com custo cadastrado)</p>
        )}
      </div>

      {/* Incidentes */}
      {incidentes.total > 0 && (
        <Bloco titulo="⚠️ Incidentes" cor={incidentes.abertos > 0 ? 'red' : 'gray'}>
          <Linha label="Total" valor={incidentes.total} />
          <Linha label="Abertos" valor={incidentes.abertos} destaque cor={incidentes.abertos > 0 ? 'vermelho' : 'verde'} />
          <Linha label="Custo abertos" valor={fmt(incidentes.custo_abertos)} cor="vermelho" destaque={incidentes.custo_abertos > 0} />
          {incidentes.troco_pendente > 0 && <Linha label="Trocos pendentes" valor={incidentes.troco_pendente} cor="amarelo" destaque />}
          {incidentes.pedidos_esquecidos > 0 && <Linha label="Pedidos esquecidos" valor={incidentes.pedidos_esquecidos} cor="vermelho" destaque />}
          {incidentes.deducao_falhou > 0 && <Linha label="Falhas de dedução" valor={incidentes.deducao_falhou} cor="vermelho" destaque />}
        </Bloco>
      )}

      {/* Estoque */}
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
