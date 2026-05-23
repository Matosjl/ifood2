import { useState, useEffect, useCallback } from 'react';
import {
  listFiadoClientes, createFiadoCliente, updateFiadoCliente, deleteFiadoCliente,
  toggleBloqueio, listFiadoCompras, createFiadoCompra, pagarFiadoCompra,
  cancelarFiadoCompra, getFiadoResumo,
} from '../api/fiado';

const fmt = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
const diasAtraso = (ultimo) => {
  if (!ultimo) return null;
  const diff = Math.floor((Date.now() - new Date(ultimo)) / 86400000);
  return diff;
};

const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function acertoLabel(c) {
  if (!c) return null;
  if (c.acerto_type === 'day_of_week' && c.acerto_weekday != null) {
    return `toda ${WEEKDAY_LABELS[c.acerto_weekday]}`;
  }
  if (c.dia_acerto) return `dia ${c.dia_acerto} de cada mês`;
  return null;
}

// ── Modal de cliente ──────────────────────────────────────────
function ClienteModal({ cliente, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:           cliente?.name ?? '',
    phone:          cliente?.phone ?? '',
    address:        cliente?.address ?? '',
    dia_acerto:     cliente?.dia_acerto ?? '',
    notes:          cliente?.notes ?? '',
    acerto_type:    cliente?.acerto_type ?? 'day_of_month',
    acerto_weekday: cliente?.acerto_weekday ?? 5, // sexta como padrão
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Nome é obrigatório.');
    setSaving(true); setError(null);
    try {
      if (cliente?.id) await updateFiadoCliente(cliente.id, form);
      else await createFiadoCliente(form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/10 w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-white">{cliente ? 'Editar Cliente' : 'Novo Cliente'}</h3>

        {/* Nome */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Nome *</label>
          <input value={form.name} onChange={set('name')} placeholder="João Silva" className="input w-full" />
        </div>

        {/* Telefone */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Telefone</label>
          <input value={form.phone} onChange={set('phone')} placeholder="(51) 99999-9999" className="input w-full" />
        </div>

        {/* Dia de acerto */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Dia de acerto</label>
          {/* Toggle tipo */}
          <div className="flex gap-2 mb-3">
            {[
              { value: 'day_of_month', label: '📅 Dia do mês' },
              { value: 'day_of_week',  label: '🗓️ Dia da semana' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm(p => ({ ...p, acerto_type: value }))}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  form.acerto_type === value
                    ? 'bg-orange-500 text-white'
                    : 'border border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {form.acerto_type === 'day_of_month' ? (
            <input
              type="number"
              min={1} max={31}
              value={form.dia_acerto}
              onChange={set('dia_acerto')}
              placeholder="Ex: 15"
              className="input w-full"
            />
          ) : (
            <select
              value={form.acerto_weekday}
              onChange={e => setForm(p => ({ ...p, acerto_weekday: Number(e.target.value) }))}
              className="input w-full"
            >
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={i} value={i}>{label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Endereço */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Endereço</label>
          <textarea value={form.address} onChange={set('address')} rows={2} placeholder="Rua, número, bairro" className="input w-full resize-none" />
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Observações</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} className="input w-full resize-none" />
        </div>

        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de detalhe do cliente ───────────────────────────────
function ClienteDetalhe({ cliente, onClose, onUpdate }) {
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [novaCompra, setNovaCompra] = useState(false);
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoTipo, setNovoTipo] = useState('compra');
  const [saving, setSaving] = useState(false);

  const fetchCompras = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listFiadoCompras(cliente.id);
      setCompras(data.data ?? []);
    } finally { setLoading(false); }
  }, [cliente.id]);

  useEffect(() => { fetchCompras(); }, [fetchCompras]);

  const totalDevido    = compras.filter(c => c.status === 'pendente' && c.tipo !== 'adiantamento').reduce((s, c) => s + Number(c.valor), 0);
  const totalCredito   = compras.filter(c => c.status === 'pendente' && c.tipo === 'adiantamento').reduce((s, c) => s + Number(c.valor), 0);
  const totalAberto    = totalDevido - totalCredito;
  const totalPago      = compras.filter(c => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0);
  const totalCancelado = compras.filter(c => c.status === 'cancelado').reduce((s, c) => s + Number(c.valor), 0);
  const ultimoPagamento = compras.filter(c => c.status === 'pago').sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))[0];

  const handlePagar = async (id) => {
    if (!confirm('Marcar como pago?')) return;
    await pagarFiadoCompra(id);
    fetchCompras(); onUpdate();
  };
  const handleCancelar = async (id) => {
    if (!confirm('Cancelar esta compra?')) return;
    await cancelarFiadoCompra(id);
    fetchCompras(); onUpdate();
  };
  const handleToggle = async () => {
    await toggleBloqueio(cliente.id);
    onUpdate();
    onClose();
  };
  const handleNovaCompra = async () => {
    if (!novoValor) return;
    setSaving(true);
    try {
      const defaultDesc = novoTipo === 'adiantamento' ? 'Pagamento adiantado' : 'Compra avulsa';
      await createFiadoCompra({ cliente_id: cliente.id, descricao: novaDescricao || defaultDesc, valor: novoValor, tipo: novoTipo });
      setNovaCompra(false); setNovaDescricao(''); setNovoValor(''); setNovoTipo('compra');
      fetchCompras(); onUpdate();
    } finally { setSaving(false); }
  };

  const statusBadge = (s) => ({
    pendente:  'bg-yellow-500/20 text-yellow-300',
    pago:      'bg-green-500/20 text-green-300',
    cancelado: 'bg-red-500/20 text-red-400',
  }[s] ?? '');

  const tipoBadge = (t) => t === 'adiantamento'
    ? 'bg-blue-500/20 text-blue-300'
    : '';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl border border-white/10 w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">{cliente.name}</h2>
            <p className="text-sm text-gray-400">{cliente.phone || 'Sem telefone'} · {cliente.address || 'Sem endereço'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditando(true)} className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">Editar</button>
            <button onClick={handleToggle} className={`px-3 py-1.5 text-sm rounded-lg font-semibold transition-colors ${cliente.bloqueado ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}>
              {cliente.bloqueado ? '✓ Desbloquear' : '✗ Bloquear'}
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">✕ Fechar</button>
          </div>
        </div>

        {/* Resumo financeiro */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-white/10">
          {[
            { label: totalAberto < 0 ? 'Crédito disponível' : 'Em aberto', value: fmt(Math.abs(totalAberto)), color: totalAberto < 0 ? 'text-blue-400' : totalAberto > 0 ? 'text-yellow-400' : 'text-green-400' },
            { label: 'Crédito (adiant.)', value: fmt(totalCredito), color: 'text-blue-400' },
            { label: 'Recebido', value: fmt(totalPago), color: 'text-green-400' },
            { label: 'Último pag.', value: ultimoPagamento ? fmtDate(ultimoPagamento.paid_at) : '—', color: 'text-gray-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-800/50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Dia de acerto */}
        {acertoLabel(cliente) && (
          <div className="px-6 py-3 border-b border-white/10 text-sm text-gray-400">
            🗓️ Dia de acerto: <span className="text-white font-semibold">{acertoLabel(cliente)}</span>
          </div>
        )}

        {/* Compras */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Histórico de Compras</h3>
            <button onClick={() => setNovaCompra(true)} className="px-3 py-1.5 text-sm rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors font-semibold">
              + Adicionar Compra
            </button>
          </div>

          {novaCompra && (
            <div className="bg-gray-800/50 rounded-xl p-4 mb-4 space-y-3">
              {/* Tipo */}
              <div className="flex gap-2">
                <button
                  onClick={() => setNovoTipo('compra')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${novoTipo === 'compra' ? 'bg-orange-500 text-white' : 'border border-white/10 text-gray-400 hover:text-white'}`}
                >
                  🛒 Fiado (deve)
                </button>
                <button
                  onClick={() => setNovoTipo('adiantamento')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${novoTipo === 'adiantamento' ? 'bg-blue-500 text-white' : 'border border-white/10 text-gray-400 hover:text-white'}`}
                >
                  💰 Adiantamento (crédito)
                </button>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Descrição</label>
                  <input
                    value={novaDescricao}
                    onChange={e => setNovaDescricao(e.target.value)}
                    placeholder={novoTipo === 'adiantamento' ? 'Ex: Pagamento adiantado' : 'Ex: Lanche do dia'}
                    className="input w-full"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs text-gray-400 mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={novoValor} onChange={e => setNovoValor(e.target.value)} placeholder="0,00" className="input w-full" />
                </div>
                <button onClick={handleNovaCompra} disabled={saving} className={`px-4 py-2 rounded-xl text-white font-bold text-sm disabled:opacity-50 ${novoTipo === 'adiantamento' ? 'bg-blue-500 hover:bg-blue-400' : 'bg-orange-500 hover:bg-orange-400'}`}>Salvar</button>
                <button onClick={() => { setNovaCompra(false); setNovoTipo('compra'); }} className="px-3 py-2 rounded-xl border border-white/10 text-gray-400 text-sm">✕</button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-500 py-8">Carregando...</p>
          ) : compras.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nenhuma compra registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-white/10">
                    <th className="pb-2 text-left font-medium">Data</th>
                    <th className="pb-2 text-left font-medium">Descrição</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                    <th className="pb-2 text-center font-medium">Status</th>
                    <th className="pb-2 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c) => {
                    const isAdiantamento = c.tipo === 'adiantamento';
                    return (
                    <tr key={c.id} className={`border-b border-white/5 hover:bg-white/5 ${isAdiantamento ? 'bg-blue-500/5' : ''}`}>
                      <td className="py-2 text-gray-400">{fmtDateTime(c.created_at)}</td>
                      <td className="py-2 text-gray-300">
                        <div className="flex items-center gap-2">
                          {isAdiantamento && <span className="text-blue-400">💰</span>}
                          <span>{c.descricao}</span>
                          {c.order_number && <span className="text-xs text-gray-500">#{c.order_number}</span>}
                          {isAdiantamento && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${tipoBadge(c.tipo)}`}>crédito</span>
                          )}
                        </div>
                      </td>
                      <td className={`py-2 text-right font-semibold ${isAdiantamento ? 'text-blue-400' : 'text-white'}`}>
                        {isAdiantamento ? '+ ' : ''}{fmt(c.valor)}
                      </td>
                      <td className="py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(c.status)}`}>
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        {c.status === 'pendente' && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => handlePagar(c.id)} className="px-2 py-1 text-xs rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">
                              {isAdiantamento ? 'Usar' : 'Pago'}
                            </button>
                            <button onClick={() => handleCancelar(c.id)} className="px-2 py-1 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Cancelar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editando && (
        <ClienteModal
          cliente={cliente}
          onClose={() => setEditando(false)}
          onSaved={() => { setEditando(false); onUpdate(); onClose(); }}
        />
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function FiadoPage() {
  const [clientes,    setClientes]    = useState([]);
  const [resumo,      setResumo]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [order,       setOrder]       = useState('name');
  const [novoModal,   setNovoModal]   = useState(false);
  const [detalhe,     setDetalhe]     = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        listFiadoClientes({ search, order }),
        getFiadoResumo(),
      ]);
      setClientes(cRes.data.data ?? []);
      setResumo(rRes.data.data ?? null);
    } finally { setLoading(false); }
  }, [search, order]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-white">Fiado</h1>
            <p className="text-sm text-gray-500">Controle de contas a receber</p>
          </div>
          <button onClick={() => setNovoModal(true)} className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold transition-colors">
            + Novo Cliente
          </button>
        </div>

        {/* Resumo cards */}
        {resumo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total em aberto', value: fmt(resumo.total_aberto), color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
              { label: 'Total recebido', value: fmt(resumo.total_recebido), color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: 'Clientes ativos', value: resumo.total_clientes, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Bloqueados', value: resumo.clientes_bloqueados, color: 'text-red-400', bg: 'bg-red-500/10' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-3 border border-white/5`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xl font-black ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Busca + ordenação */}
        <div className="flex gap-3">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="input flex-1"
          />
          <select value={order} onChange={(e) => setOrder(e.target.value)} className="input w-44">
            <option value="name">Nome A-Z</option>
            <option value="valor">Maior dívida</option>
            <option value="data">Último fiado</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-center text-gray-500 py-12">Carregando...</p>
        ) : clientes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-3">Nenhum cliente cadastrado.</p>
            <button onClick={() => setNovoModal(true)} className="px-4 py-2 rounded-xl bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors text-sm font-semibold">
              Cadastrar primeiro cliente
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {clientes.map((c) => {
              const atraso = diasAtraso(c.ultimo_fiado);
              return (
                <div
                  key={c.id}
                  onClick={() => setDetalhe(c)}
                  className="bg-gray-900 hover:bg-gray-800 border border-white/10 rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange-400 font-bold text-sm">{c.name[0].toUpperCase()}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white truncate">{c.name}</span>
                      {c.bloqueado && (
                        <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-md font-semibold">BLOQUEADO</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {c.phone || 'Sem telefone'}
                      {acertoLabel(c) ? ` · Acerto ${acertoLabel(c)}` : ''}
                    </p>
                  </div>

                  {/* Valor + atraso */}
                  <div className="text-right flex-shrink-0">
                    <p className={`font-black text-lg ${Number(c.total_aberto) > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {fmt(c.total_aberto)}
                    </p>
                    {c.ultimo_fiado && (
                      <p className={`text-xs ${atraso > 30 ? 'text-red-400' : atraso > 7 ? 'text-orange-400' : 'text-gray-500'}`}>
                        {atraso === 0 ? 'Hoje' : `há ${atraso} dias`}
                      </p>
                    )}
                  </div>

                  <span className="text-gray-600">›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {novoModal && (
        <ClienteModal onClose={() => setNovoModal(false)} onSaved={() => { setNovoModal(false); fetchAll(); }} />
      )}
      {detalhe && (
        <ClienteDetalhe cliente={detalhe} onClose={() => setDetalhe(null)} onUpdate={fetchAll} />
      )}
    </div>
  );
}
