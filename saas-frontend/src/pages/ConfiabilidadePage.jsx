import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const CRITERIOS_LABEL = {
  caixa_conciliado:          'Caixa conciliado',
  todos_pedidos_com_custo:   'Pedidos com custo cadastrado',
  sem_falha_deducao_insumos: 'Sem falha na dedução de insumos',
  todos_insumos_deduziram:   'Insumos deduziram em todos os pedidos',
  sem_divergencia_caixa:     'Sem divergência de caixa',
};

function DotDia({ dia }) {
  const isToday = dia.date === new Date().toISOString().slice(0, 10);
  const bg = dia.confiavel
    ? 'bg-green-500'
    : dia.score >= 3
    ? 'bg-yellow-500'
    : 'bg-red-500/60';

  return (
    <div className="group relative flex flex-col items-center gap-0.5">
      <div className={`w-4 h-4 rounded-full ${bg} ${isToday ? 'ring-2 ring-white/40' : ''} cursor-pointer`} />
      <span className="text-[8px] text-gray-600">{dia.date.slice(8)}</span>
      {/* Tooltip */}
      <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-gray-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs whitespace-nowrap shadow-xl">
        <p className="font-bold text-gray-200 mb-1">{dia.date} — {dia.score}/5</p>
        {Object.entries(dia.criterios).map(([k, v]) => (
          <p key={k} className={v ? 'text-green-400' : 'text-red-400'}>
            {v ? '✅' : '❌'} {CRITERIOS_LABEL[k]}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function ConfiabilidadePage() {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data } = await api.get('/operacao/confiabilidade?dias=30');
      setDados(data.data);
    } catch (e) {
      setErro(e.response?.data?.message ?? 'Erro ao carregar dados.');
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

  const { streak_atual, melhor_streak, meta, meta_atingida, historico } = dados;
  const hoje = historico[0];
  const progresso = Math.min((streak_atual / meta) * 100, 100);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-black text-gray-100">🛡️ Confiabilidade Operacional</h1>
        <p className="text-xs text-gray-500 mt-0.5">Dias consecutivos sem divergência</p>
      </div>

      {/* Contador principal */}
      <div className={`rounded-2xl p-6 border text-center ${meta_atingida ? 'bg-green-500/10 border-green-500/30' : 'bg-gray-800/40 border-white/[0.06]'}`}>
        <p className={`text-7xl font-black tabular-nums ${meta_atingida ? 'text-green-400' : streak_atual > 0 ? 'text-orange-400' : 'text-gray-600'}`}>
          {streak_atual}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          {streak_atual === 1 ? 'dia sem divergência' : 'dias sem divergência'}
        </p>

        {/* Barra de progresso até a meta */}
        <div className="mt-4 mx-auto max-w-xs">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>0</span>
            <span className="text-orange-400 font-semibold">Meta: {meta} dias</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${meta_atingida ? 'bg-green-500' : 'bg-orange-500'}`}
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {meta_atingida && (
          <p className="text-xs text-green-400 mt-3 font-semibold">
            🎉 Meta atingida! O sistema é operacionalmente confiável.
          </p>
        )}
        {!meta_atingida && streak_atual > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Faltam {meta - streak_atual} dia{meta - streak_atual !== 1 ? 's' : ''} para a meta
          </p>
        )}
        {streak_atual === 0 && (
          <p className="text-xs text-red-400 mt-3">
            Corrija as divergências de hoje para iniciar uma sequência
          </p>
        )}

        <p className="text-xs text-gray-600 mt-2">
          Melhor sequência: <span className="text-gray-400 font-semibold">{melhor_streak} dias</span>
        </p>
      </div>

      {/* Critérios de hoje */}
      {hoje && (
        <div className="bg-gray-800/40 rounded-2xl p-4 border border-white/[0.06] space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            Critérios de hoje — {hoje.score}/5
          </p>
          {Object.entries(CRITERIOS_LABEL).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2.5">
              <span className={`text-base shrink-0 ${hoje.criterios[key] ? 'text-green-400' : 'text-red-400'}`}>
                {hoje.criterios[key] ? '✅' : '❌'}
              </span>
              <span className={`text-sm ${hoje.criterios[key] ? 'text-gray-300' : 'text-red-300'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Histórico — últimos 30 dias */}
      <div className="bg-gray-800/40 rounded-2xl p-4 border border-white/[0.06]">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
          Histórico — últimos 30 dias
        </p>
        <div className="flex flex-wrap gap-1.5 justify-start">
          {[...historico].reverse().map((dia) => (
            <DotDia key={dia.date} dia={dia} />
          ))}
        </div>
        <div className="flex gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Confiável (5/5)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Parcial (3-4/5)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full bg-red-500/60 inline-block" /> Com divergência
          </span>
        </div>
      </div>

    </div>
  );
}
