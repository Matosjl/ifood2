import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  getSummary, getExpenses, createExpense, updateExpense,
  payExpense, deleteExpense, getReminders, getResult,
} from '../api/financeiro';
import { getCurrentCaixa, openCaixa, closeCaixa, getCaixaHistory, postSangria, postSuprimento, getCaixaMovements } from '../api/caixa';
import { getBancoBalance, getBancoTransactions, addBancoTransaction, deleteBancoTransaction } from '../api/banco';
import usePendingReceipts from '../hooks/usePendingReceipts';
import ReceiptConfirmModal from '../components/ReceiptConfirmModal';
import ReceiptUploadModal  from '../components/ReceiptUploadModal';

// ── Formatters ────────────────────────────────────────────────

const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);

const fmtNum = (n) =>
  new Intl.NumberFormat('pt-BR').format(n ?? 0);

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d.toString().substring(0, 10) + 'T12:00:00');
  return dt.toLocaleDateString('pt-BR');
};

const todayISO  = () => new Date().toISOString().slice(0, 10);
const monthISO  = () => new Date().toISOString().slice(0, 7);

// ── Constants ─────────────────────────────────────────────────

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: 'week',  label: '7 Dias' },
  { id: 'month', label: 'Este Mês' },
];

const CHANNEL_DISPLAY = {
  ifood:    { label: 'iFood',    emoji: '🛵', color: '#ef4444' },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: '#22c55e' },
  mesa:     { label: 'Mesa',     emoji: '🪑', color: '#3b82f6' },
  balcao:   { label: 'Balcão',   emoji: '🏪', color: '#a855f7' },
  telefone: { label: 'Telefone', emoji: '📞', color: '#f59e0b' },
  manual:   { label: 'Manual',   emoji: '✏️', color: '#6b7280' },
  online:   { label: 'Online',   emoji: '🌐', color: '#06b6d4' },
};
const getChannel = (ch) =>
  CHANNEL_DISPLAY[ch?.toLowerCase?.()] ?? { label: ch ?? '—', emoji: '📦', color: '#6b7280' };

const CATEGORIES = [
  { id: 'rent',          label: 'Aluguel',            emoji: '🏠' },
  { id: 'utilities',     label: 'Água / Luz / Internet', emoji: '💡' },
  { id: 'food_supplier', label: 'Fornecedor de Alimentos', emoji: '🥩' },
  { id: 'staff',         label: 'Funcionários',        emoji: '👷' },
  { id: 'marketing',     label: 'Marketing',           emoji: '📣' },
  { id: 'tax',           label: 'Impostos / Taxas',    emoji: '📋' },
  { id: 'maintenance',   label: 'Manutenção',          emoji: '🔧' },
  { id: 'other',         label: 'Outro',               emoji: '📦' },
];

const PAYMENT_METHODS = [
  { id: 'pix',      label: 'Pix' },
  { id: 'cash',     label: 'Dinheiro' },
  { id: 'credit',   label: 'Cartão de Crédito' },
  { id: 'debit',    label: 'Cartão de Débito' },
  { id: 'boleto',   label: 'Boleto' },
  { id: 'transfer', label: 'Transferência' },
];

const getCat  = (id) => CATEGORIES.find((c) => c.id === id) ?? { label: id, emoji: '📦' };
const getPM   = (id) => PAYMENT_METHODS.find((p) => p.id === id)?.label ?? id;

const STATUS_COLOR = {
  pending:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  paid:     'bg-green-500/15  text-green-400  border-green-500/30',
  overdue:  'bg-red-500/15    text-red-400    border-red-500/30',
};
const STATUS_LABEL = { pending: 'Pendente', paid: 'Pago', overdue: 'Vencido' };

// ── Bar chart ─────────────────────────────────────────────────

function BarChart({ data, formatX, formatTooltip, color = '#3b82f6' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-[3px] h-32 w-full">
      {data.map((d, i) => {
        const pct = Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0);
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1 min-w-0 h-full justify-end group">
            <div
              className="w-full rounded-t-sm transition-all duration-500 relative cursor-default"
              style={{ height: `${pct}%`, backgroundColor: color + 'aa' }}
            >
              {d.value > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-gray-900 border border-white/10 rounded text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {formatTooltip ? formatTooltip(d) : d.value}
                </div>
              )}
            </div>
            <span className="text-[9px] text-gray-600 truncate w-full text-center leading-none mt-0.5">
              {formatX ? formatX(d) : d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────

function MetricCard({ label, value, sub, icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/25 text-blue-400',
    green:  'bg-gradient-to-br from-green-500/20 to-emerald-600/10 border-green-500/25 text-green-400',
    orange: 'bg-gradient-to-br from-orange-500/20 to-amber-600/10 border-orange-500/25 text-orange-400',
    red:    'bg-gradient-to-br from-red-500/20 to-rose-600/10 border-red-500/25 text-red-400',
    purple: 'bg-gradient-to-br from-purple-500/20 to-pink-600/10 border-purple-500/25 text-purple-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color] ?? colors.blue}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
          <p className="text-2xl font-black text-white mt-1 leading-tight">{value}</p>
          {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

// ── Expense modal ─────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', supplier: '', category: 'other',
  amount: '', paymentMethod: 'pix',
  isInstallment: false, installmentTotal: 2,
  dueDate: todayISO(), notes: '', recurrence: '',
};

function ExpenseModal({ expense, onClose, onSaved }) {
  const [form, setForm]     = useState(expense ? {
    name:             expense.name,
    supplier:         expense.supplier ?? '',
    category:         expense.category,
    amount:           expense.amount,
    paymentMethod:    expense.payment_method,
    isInstallment:    expense.is_installment,
    installmentTotal: expense.installment_total ?? 2,
    dueDate:          expense.due_date?.slice(0, 10) ?? todayISO(),
    notes:            expense.notes ?? '',
    recurrence:       expense.recurrence ?? '',
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      if (expense) {
        await updateExpense(expense.id, form);
      } else {
        await createExpense(form);
      }
      onSaved();
    } catch (ex) {
      setErr(ex?.response?.data?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-bold text-white">
            {expense ? 'Editar Gasto' : 'Novo Gasto'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {err && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Nome do Gasto *</label>
            <input
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Aluguel do salão"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </div>

          {/* Fornecedor */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Fornecedor / Empresa</label>
            <input
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Imobiliária, Sabesp, Fornecedor XYZ"
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
            />
          </div>

          {/* Categoria + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Categoria</label>
              <select
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Valor (R$) *</label>
              <input
                type="number" step="0.01" min="0"
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Pagamento + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Forma de Pagamento</label>
              <select
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.paymentMethod}
                onChange={(e) => set('paymentMethod', e.target.value)}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Data de Vencimento *</label>
              <input
                type="date"
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Parcelado */}
          {!expense && (
            <div className="bg-gray-800/50 border border-white/[0.06] rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-blue-500"
                  checked={form.isInstallment}
                  onChange={(e) => set('isInstallment', e.target.checked)}
                />
                <span className="text-sm text-white font-medium">Parcelado</span>
              </label>

              {form.isInstallment && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">
                    Número de Parcelas
                  </label>
                  <input
                    type="number" min="2" max="60"
                    className="w-full bg-gray-700 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.installmentTotal}
                    onChange={(e) => set('installmentTotal', parseInt(e.target.value, 10))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Serão criadas {form.installmentTotal} parcelas de{' '}
                    <strong className="text-gray-300">{fmtBRL(form.amount / form.installmentTotal || 0)}</strong>{' '}
                    mensais a partir de {fmtDate(form.dueDate)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recorrência */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Recorrência</label>
            <select
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.recurrence}
              onChange={(e) => set('recurrence', e.target.value)}
            >
              <option value="">Sem recorrência</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Observações</label>
            <textarea
              rows={2}
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Detalhes adicionais..."
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando…' : expense ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab: Receitas (existing) ──────────────────────────────────

function TabReceitas() {
  const [period,  setPeriod]  = useState('today');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: res } = await getSummary(period);
      setData(res.data);
    } catch {
      setError('Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const chartData = (() => {
    if (!data?.timeSeries) return [];
    if (period === 'today') {
      return data.timeSeries.map((r) => ({
        label: `${String(r.hour).padStart(2, '0')}h`,
        value: r.revenue, count: r.count,
      }));
    }
    return data.timeSeries.map((r) => {
      const d = new Date(r.date + 'T12:00:00');
      return {
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        value: r.revenue, count: r.count,
      };
    });
  })();

  const maxChRevenue = Math.max(...(data?.byChannel ?? []).map((c) => c.revenue), 1);

  return (
    <div className="flex flex-col h-full">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-900/60 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-1 bg-gray-800/70 rounded-xl p-1">
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === id ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {error && <div className="text-center py-12 text-red-400 text-sm">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard icon="💵" label="Receita"    value={fmtBRL(data.revenue)}
                sub={`${fmtNum(data.order_count)} pedido${data.order_count !== 1 ? 's' : ''}`} color="green" />
              <MetricCard icon="🧾" label="Concluídos" value={fmtNum(data.order_count)}
                sub={period === 'today' ? 'hoje' : period === 'week' ? 'últimos 7 dias' : 'neste mês'} color="blue" />
              <MetricCard icon="🎯" label="Ticket Médio" value={fmtBRL(data.avg_ticket)} sub="por pedido" color="orange" />
            </div>

            <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-300">
                  {period === 'today' ? 'Receita por Hora' : 'Receita por Dia'}
                </h2>
                <span className="text-xs text-gray-500">Total: {fmtBRL(data.revenue)}</span>
              </div>
              {chartData.every((d) => d.value === 0) ? (
                <div className="h-32 flex items-center justify-center text-gray-600 text-sm italic">
                  Nenhuma venda neste período
                </div>
              ) : (
                <BarChart data={chartData} color="#f97316"
                  formatTooltip={(d) => `${d.label}: ${fmtBRL(d.value)} (${d.count} ped.)`} />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <h2 className="text-sm font-bold text-gray-300 mb-3">Por Canal</h2>
                {data.byChannel.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">Sem dados</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.byChannel.map((ch) => {
                      const info = getChannel(ch.channel);
                      const pct  = (ch.revenue / maxChRevenue) * 100;
                      return (
                        <div key={ch.channel}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{info.emoji}</span>
                              <span className="text-sm text-gray-300 font-medium">{info.label}</span>
                              <span className="text-xs text-gray-500">({ch.count})</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-200 tabular-nums">{fmtBRL(ch.revenue)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: info.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <h2 className="text-sm font-bold text-gray-300 mb-3">Top Produtos</h2>
                {data.topProducts.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">Sem dados</p>
                ) : (
                  <div className="space-y-2">
                    {data.topProducts.map((p, i) => {
                      const maxRev = data.topProducts[0]?.revenue ?? 1;
                      const pct    = (p.revenue / maxRev) * 100;
                      return (
                        <div key={p.product_name} className="flex items-center gap-3">
                          <span className="text-xs font-black text-gray-600 w-4 shrink-0 tabular-nums">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-xs text-gray-300 truncate font-medium">{p.product_name}</span>
                              <span className="text-xs text-gray-400 tabular-nums shrink-0">{fmtBRL(p.revenue)}</span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-orange-500/70 transition-all duration-700"
                                style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: Gastos ───────────────────────────────────────────────

function TabGastos() {
  const [month,      setMonth]      = useState(monthISO());
  const [expenses,   setExpenses]   = useState([]);
  const [reminders,  setReminders]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(null); // null | 'new' | expense obj
  const [deleting,   setDeleting]   = useState(null);
  const [paying,     setPaying]     = useState(null);
  const [filterCat,  setFilterCat]  = useState('all');
  const [filterSt,   setFilterSt]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, remRes] = await Promise.all([
        getExpenses(month),
        getReminders(),
      ]);
      // Compute overdue client-side
      const today = todayISO();
      const rows = (expRes.data.data ?? []).map((e) => ({
        ...e,
        status: e.status === 'pending' && e.due_date < today ? 'overdue' : e.status,
      }));
      setExpenses(rows);
      setReminders(remRes.data.data ?? []);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const handlePay = async (id) => {
    setPaying(id);
    try { await payExpense(id); await load(); } finally { setPaying(null); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este gasto?')) return;
    setDeleting(id);
    try { await deleteExpense(id); await load(); } finally { setDeleting(null); }
  };

  // Filtered list
  const filtered = expenses.filter((e) => {
    if (filterCat !== 'all' && e.category !== filterCat) return false;
    if (filterSt  !== 'all' && e.status   !== filterSt)  return false;
    return true;
  });

  // Summary
  const total   = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const paid    = expenses.filter((e) => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);
  const pending = expenses.filter((e) => e.status !== 'paid').reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-900/60 border-b border-white/[0.06] shrink-0">
        <input
          type="month"
          className="bg-gray-800 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Novo Gasto
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-4">
        {/* Reminders */}
        {reminders.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔔</span>
              <span className="text-sm font-bold text-yellow-400">
                {reminders.length} gasto{reminders.length > 1 ? 's vencem' : ' vence'} em breve
              </span>
            </div>
            <div className="space-y-1.5">
              {reminders.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-yellow-200 font-medium">{r.name}</span>
                  <span className="text-yellow-400/70">{fmtDate(r.due_date)} · {fmtBRL(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard icon="💸" label="Total do mês"  value={fmtBRL(total)}   color="red" />
          <MetricCard icon="✅" label="Já pago"        value={fmtBRL(paid)}    color="green" />
          <MetricCard icon="⏳" label="A pagar"        value={fmtBRL(pending)} color="orange" />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <select
            className="bg-gray-800 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="all">Todas categorias</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
          <select
            className="bg-gray-800 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
            value={filterSt}
            onChange={(e) => setFilterSt(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
            <option value="overdue">Vencido</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <div className="text-4xl mb-3">💸</div>
            <p className="text-sm">Nenhum gasto registrado neste mês</p>
            <button
              onClick={() => setModal('new')}
              className="mt-4 px-4 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-600/30 transition-colors"
            >
              + Adicionar primeiro gasto
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((e) => {
              const cat = getCat(e.category);
              return (
                <div
                  key={e.id}
                  className={`bg-gray-900/60 border rounded-2xl p-4 transition-all ${
                    e.status === 'overdue' ? 'border-red-500/30' : 'border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left */}
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-xl mt-0.5 shrink-0">{cat.emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">{e.name}</span>
                          {e.is_installment && (
                            <span className="text-[10px] bg-blue-500/20 border border-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded-full font-semibold">
                              {e.installment_current}/{e.installment_total}x
                            </span>
                          )}
                          {e.recurrence && (
                            <span className="text-[10px] bg-purple-500/20 border border-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full font-semibold">
                              {e.recurrence === 'monthly' ? '🔄 Mensal' : '🔄 Anual'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-500">{cat.label}</span>
                          {e.supplier && <span className="text-xs text-gray-500">· {e.supplier}</span>}
                          <span className="text-xs text-gray-500">· {getPM(e.payment_method)}</span>
                          <span className="text-xs text-gray-500">· Vence {fmtDate(e.due_date)}</span>
                        </div>
                        {e.notes && <p className="text-xs text-gray-600 mt-1 italic">{e.notes}</p>}
                      </div>
                    </div>

                    {/* Right */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-base font-black text-white tabular-nums">{fmtBRL(e.amount)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[e.status]}`}>
                        {STATUS_LABEL[e.status]}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                    {e.status !== 'paid' && (
                      <button
                        onClick={() => handlePay(e.id)}
                        disabled={paying === e.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-600/30 transition-colors disabled:opacity-50"
                      >
                        {paying === e.id ? (
                          <div className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin" />
                        ) : '✓'} Marcar como Pago
                      </button>
                    )}
                    <button
                      onClick={() => setModal(e)}
                      className="px-3 py-1.5 rounded-xl bg-gray-800 border border-white/10 text-gray-400 text-xs font-medium hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deleting === e.id}
                      className="ml-auto px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {deleting === e.id ? '…' : 'Excluir'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ExpenseModal
          expense={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Tab: Resultado ────────────────────────────────────────────

function TabResultado() {
  const [month,   setMonth]   = useState(monthISO());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await getResult(month);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const profitPct = data?.revenue > 0
    ? ((data.profit / data.revenue) * 100).toFixed(1)
    : 0;
  const isProfit  = (data?.profit ?? 0) >= 0;

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-900/60 border-b border-white/[0.06] shrink-0">
        <h2 className="text-sm font-bold text-gray-300">Resultado do Mês</h2>
        <input
          type="month"
          className="bg-gray-800 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data && (
          <>
            {/* Big result card */}
            <div className={`rounded-2xl border p-6 text-center ${
              isProfit
                ? 'bg-green-500/10 border-green-500/25'
                : 'bg-red-500/10 border-red-500/25'
            }`}>
              <p className="text-sm text-gray-400 font-semibold uppercase tracking-wide mb-1">
                {isProfit ? '✅ Lucro Estimado' : '⚠️ Prejuízo Estimado'}
              </p>
              <p className={`text-5xl font-black ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                {fmtBRL(Math.abs(data.profit))}
              </p>
              {data.revenue > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  {isProfit ? '+' : '-'}{Math.abs(profitPct)}% da receita
                </p>
              )}
            </div>

            {/* Breakdown */}
            <div className="bg-gray-900/60 border border-white/[0.06] rounded-2xl p-4 space-y-4">
              <h3 className="text-sm font-bold text-gray-300">Composição</h3>

              {/* Revenue bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 font-medium">💵 Receita Total</span>
                  <span className="text-green-400 font-bold tabular-nums">{fmtBRL(data.revenue)}</span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500/70 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>

              {/* Expenses bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 font-medium">💸 Gastos Totais</span>
                  <span className="text-red-400 font-bold tabular-nums">{fmtBRL(data.total_expenses)}</span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500/70 rounded-full transition-all duration-700"
                    style={{ width: data.revenue > 0 ? `${Math.min((data.total_expenses / data.revenue) * 100, 100)}%` : '0%' }} />
                </div>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-[10px] text-gray-500">Pago: <strong className="text-gray-300">{fmtBRL(data.paid_expenses)}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-[10px] text-gray-500">Pendente: <strong className="text-gray-300">{fmtBRL(data.pending_expenses)}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary rows */}
            <div className="bg-gray-900/60 border border-white/[0.06] rounded-2xl divide-y divide-white/[0.06]">
              {[
                { label: 'Receita bruta',      value: data.revenue,          color: 'text-green-400', sign: '+' },
                { label: 'Gastos pagos',        value: data.paid_expenses,    color: 'text-red-400',   sign: '-' },
                { label: 'Gastos pendentes',    value: data.pending_expenses, color: 'text-yellow-400',sign: '-' },
                { label: isProfit ? '= Lucro' : '= Prejuízo',
                  value: Math.abs(data.profit), color: isProfit ? 'text-green-400' : 'text-red-400',
                  sign: isProfit ? '+' : '-', bold: true },
              ].map(({ label, value, color, sign, bold }) => (
                <div key={label} className={`flex items-center justify-between px-4 py-3 ${bold ? 'bg-white/[0.03]' : ''}`}>
                  <span className={`text-sm ${bold ? 'font-black text-white' : 'text-gray-400'}`}>{label}</span>
                  <span className={`text-sm font-bold tabular-nums ${color}`}>
                    {sign}{fmtBRL(value)}
                  </span>
                </div>
              ))}
            </div>

            {data.total_expenses === 0 && (
              <p className="text-center text-xs text-gray-600 italic">
                Nenhum gasto registrado neste mês ainda. Vá para a aba Gastos e adicione seus custos.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: Caixa ────────────────────────────────────────────────

const PM_LABELS = {
  cash: '💵 Dinheiro', pix: '📱 Pix', credit: '💳 Crédito',
  debit: '💳 Débito', voucher: '🎫 Vale Ref.', other: '🔖 Outro',
};

function TabCaixa() {
  const [caixa,       setCaixa]       = useState(undefined);
  const [history,     setHistory]     = useState([]);
  const [detail,      setDetail]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const [openVal,     setOpenVal]     = useState('');
  const [openNote,    setOpenNote]    = useState('');
  const [closeNote,   setCloseNote]   = useState('');
  const [confirm,     setConfirm]     = useState(false);
  // Contagem física no fechamento
  const [cashCounted, setCashCounted] = useState('');
  const [cardCounted, setCardCounted] = useState('');
  const [pixCounted,  setPixCounted]  = useState('');
  // Sangria / Suprimento
  const [movements,      setMovements]      = useState([]);
  const [movModal,       setMovModal]       = useState(null); // null | 'sangria' | 'suprimento'
  const [movAmount,      setMovAmount]      = useState('');
  const [movReason,      setMovReason]      = useState('');
  const [movSaving,      setMovSaving]      = useState(false);
  const [movErr,         setMovErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [currRes, histRes] = await Promise.all([
        getCurrentCaixa(),
        getCaixaHistory({ limit: 20 }),
      ]);
      setCaixa(currRes.data.data);
      setHistory(histRes.data.data ?? []);
      // Carrega movimentos do caixa atual
      const movRes = await getCaixaMovements();
      setMovements(movRes.data.data ?? []);
    } catch { setCaixa(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async () => {
    setSaving(true); setErr('');
    try {
      await openCaixa({ openingBalance: parseFloat(openVal) || 0, notes: openNote || undefined });
      setOpenVal(''); setOpenNote('');
      await load();
    } catch (e) { setErr(e?.response?.data?.message ?? 'Erro ao abrir caixa.'); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    // Validação: pelo menos um valor contado deve ser informado
    if (cashCounted === '' && cardCounted === '' && pixCounted === '') {
      setErr('Informe os valores contados em Dinheiro, Cartão e/ou Pix antes de fechar.');
      return;
    }
    setSaving(true); setErr('');
    try {
      await closeCaixa({
        notes:       closeNote   || undefined,
        cashCounted: cashCounted !== '' ? parseFloat(cashCounted) : 0,
        cardCounted: cardCounted !== '' ? parseFloat(cardCounted) : 0,
        pixCounted:  pixCounted  !== '' ? parseFloat(pixCounted)  : 0,
      });
      setCloseNote(''); setCashCounted(''); setCardCounted(''); setPixCounted('');
      setConfirm(false);
      await load();
    } catch (e) { setErr(e?.response?.data?.message ?? 'Erro ao fechar caixa.'); }
    finally { setSaving(false); }
  };

  const handleMovimento = async () => {
    if (!movAmount || parseFloat(movAmount) <= 0) { setMovErr('Informe um valor maior que zero.'); return; }
    setMovSaving(true); setMovErr('');
    try {
      const fn = movModal === 'sangria' ? postSangria : postSuprimento;
      await fn({ amount: parseFloat(movAmount), reason: movReason || undefined });
      setMovModal(null); setMovAmount(''); setMovReason('');
      const movRes = await getCaixaMovements();
      setMovements(movRes.data.data ?? []);
    } catch (e) { setMovErr(e?.response?.data?.message ?? 'Erro ao registrar.'); }
    finally { setMovSaving(false); }
  };

  const totalSangrias    = movements.filter(m => m.type === 'sangria').reduce((s,m) => s + parseFloat(m.amount), 0);
  const totalSuprimentos = movements.filter(m => m.type === 'suprimento').reduce((s,m) => s + parseFloat(m.amount), 0);

  const fmtDt = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-auto p-5 space-y-5">

      {err && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{err}</p>}

      {/* ── CAIXA FECHADO → abrir ───────────────────────────── */}
      {!caixa && (
        <div className="sticky top-0 z-10 bg-gray-900/60 border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <span className="text-2xl">🔐</span>
            <div>
              <p className="font-bold text-white">Caixa Fechado</p>
              <p className="text-xs text-gray-500">Abra o caixa para iniciar as vendas do dia</p>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Valor em caixa (dinheiro em espécie)</label>
              <input
                type="number" step="0.01" min="0" placeholder="R$ 0,00"
                value={openVal} onChange={(e) => setOpenVal(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Observação (opcional)</label>
              <input
                type="text" placeholder="Ex: Troco separado para delivery"
                value={openNote} onChange={(e) => setOpenNote(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button
              onClick={handleOpen} disabled={saving}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Abrindo…' : '🟢 Abrir Caixa'}
            </button>
          </div>
        </div>
      )}

      {/* ── CAIXA ABERTO ─────────────────────────────────────── */}
      {caixa && (
        <div className="space-y-4">
          {/* Status card */}
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-bold text-green-400 uppercase tracking-wide">Caixa Aberto</span>
                </div>
                <p className="text-2xl font-black text-white">{fmtBRL(parseFloat(caixa.opening_balance) + totalSuprimentos - totalSangrias)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Abertura: {fmtBRL(caixa.opening_balance)}
                  {totalSuprimentos > 0 && <span className="text-blue-400 ml-2">+{fmtBRL(totalSuprimentos)} sup.</span>}
                  {totalSangrias > 0 && <span className="text-orange-400 ml-2">−{fmtBRL(totalSangrias)} sang.</span>}
                </p>
                <p className="text-xs text-gray-400">Aberto em {fmtDt(caixa.opened_at)}</p>
                {caixa.opened_by_name && <p className="text-xs text-gray-500">por {caixa.opened_by_name}</p>}
                {caixa.notes && <p className="text-xs text-gray-500 italic mt-1">"{caixa.notes}"</p>}
              </div>
              <span className="text-4xl">💰</span>
            </div>
          </div>

          {/* Sangria / Suprimento */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setMovModal('sangria'); setMovAmount(''); setMovReason(''); setMovErr(''); }}
              className="py-2.5 rounded-xl border border-orange-500/30 text-orange-400 font-semibold text-sm hover:bg-orange-500/10 transition-colors flex items-center justify-center gap-1.5"
            >
              📤 Sangria
            </button>
            <button
              onClick={() => { setMovModal('suprimento'); setMovAmount(''); setMovReason(''); setMovErr(''); }}
              className="py-2.5 rounded-xl border border-blue-500/30 text-blue-400 font-semibold text-sm hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-1.5"
            >
              📥 Suprimento
            </button>
          </div>

          {/* Resumo de movimentos do caixa atual */}
          {movements.length > 0 && (
            <div className="bg-gray-800/50 rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Movimentos do Caixa</p>
                <div className="flex gap-3 text-xs">
                  {totalSangrias > 0 && <span className="text-orange-400">📤 -{fmtBRL(totalSangrias)}</span>}
                  {totalSuprimentos > 0 && <span className="text-blue-400">📥 +{fmtBRL(totalSuprimentos)}</span>}
                </div>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-40 overflow-y-auto">
                {movements.map((m) => (
                  <div key={m.id} className="px-4 py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{m.type === 'sangria' ? '📤' : '📥'}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white capitalize">{m.type}</p>
                        {m.reason && <p className="text-[10px] text-gray-500 truncate">{m.reason}</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${m.type === 'sangria' ? 'text-orange-400' : 'text-blue-400'}`}>
                        {m.type === 'sangria' ? '-' : '+'}{fmtBRL(parseFloat(m.amount))}
                      </p>
                      <p className="text-[10px] text-gray-600">{fmtDt(m.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal sangria/suprimento */}
          {movModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-white text-base">
                    {movModal === 'sangria' ? '📤 Sangria de Caixa' : '📥 Suprimento de Caixa'}
                  </p>
                  <button onClick={() => setMovModal(null)} className="text-gray-400 hover:text-white p-1">✕</button>
                </div>
                <p className="text-xs text-gray-400">
                  {movModal === 'sangria'
                    ? 'Registre a retirada de dinheiro do caixa (ex: depósito, troco, pagamento).'
                    : 'Registre a entrada de dinheiro no caixa (ex: troco adicional, reforço).'}
                </p>
                {movErr && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{movErr}</p>}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Valor (R$) *</label>
                  <input
                    type="number" step="0.01" min="0.01" placeholder="0,00"
                    value={movAmount} onChange={(e) => setMovAmount(e.target.value)}
                    autoFocus
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Motivo (opcional)</label>
                  <input
                    type="text"
                    placeholder={movModal === 'sangria' ? 'Ex: Depósito no banco' : 'Ex: Reforço de troco'}
                    value={movReason} onChange={(e) => setMovReason(e.target.value)}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setMovModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-semibold hover:bg-gray-800 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleMovimento} disabled={movSaving}
                    className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-colors disabled:opacity-50 ${movModal === 'sangria' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                  >
                    {movSaving ? 'Salvando...' : `Confirmar ${movModal === 'sangria' ? 'Sangria' : 'Suprimento'}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Close caixa */}
          {!confirm ? (
            <button
              onClick={() => setConfirm(true)}
              className="w-full py-3 rounded-xl border-2 border-red-500/40 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-colors"
            >
              🔒 Fechar Caixa
            </button>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-4">
              <div>
                <p className="text-sm font-bold text-red-400 mb-1">🔒 Fechamento de Caixa</p>
                <p className="text-xs text-gray-400">Informe os valores que você contou fisicamente. O sistema compara com as vendas registradas.</p>
              </div>

              {/* Contagem física */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-green-400 mb-1">💵 Dinheiro</label>
                  <input type="number" step="0.01" min="0" placeholder="R$ 0,00"
                    value={cashCounted} onChange={(e) => setCashCounted(e.target.value)}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-2 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-400 mb-1">💳 Cartão</label>
                  <input type="number" step="0.01" min="0" placeholder="R$ 0,00"
                    value={cardCounted} onChange={(e) => setCardCounted(e.target.value)}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-2 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-purple-400 mb-1">🔵 Pix</label>
                  <input type="number" step="0.01" min="0" placeholder="R$ 0,00"
                    value={pixCounted} onChange={(e) => setPixCounted(e.target.value)}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-2 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Totais contados vs sistema */}
              {(cashCounted !== '' || cardCounted !== '' || pixCounted !== '') && (() => {
                const counted = (parseFloat(cashCounted)||0) + (parseFloat(cardCounted)||0) + (parseFloat(pixCounted)||0);
                const diff = counted; // diff final calculado no backend
                return (
                  <div className="bg-gray-900/60 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex justify-between text-gray-400">
                      <span>Total contado:</span>
                      <span className="text-white font-bold">{fmtBRL(counted)}</span>
                    </div>
                    <p className="text-gray-500 italic">A diferença será calculada ao fechar e salva no relatório.</p>
                  </div>
                );
              })()}

              <input
                type="text" placeholder="Observação (opcional)"
                value={closeNote} onChange={(e) => setCloseNote(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-2">
                <button onClick={() => { setConfirm(false); setCashCounted(''); setCardCounted(''); setPixCounted(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleClose} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors disabled:opacity-50">
                  {saving ? 'Fechando…' : '🔒 Confirmar Fechamento'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HISTÓRICO DE CAIXAS ───────────────────────────────── */}
      <div>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Histórico de Caixas</h3>
        {history.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8 italic">Nenhum caixa fechado ainda</p>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id}
                className="bg-gray-900/60 border border-white/[0.06] rounded-2xl overflow-hidden cursor-pointer hover:border-white/10 transition-colors"
                onClick={() => setDetail(detail?.id === h.id ? null : h)}>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {new Date(h.opened_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      <span className="text-gray-500 font-normal ml-2 text-xs">
                        {new Date(h.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {h.closed_at ? ` → ${new Date(h.closed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">{h.total_orders} pedido{h.total_orders !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-green-400">{fmtBRL(h.total_revenue)}</p>
                    <p className="text-xs text-gray-500">em caixa: {fmtBRL(h.closing_balance)}</p>
                  </div>
                </div>

                {/* Expanded detail */}
                {detail?.id === h.id && h.payment_summary && (
                  <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Vendas por forma de pagamento</p>
                    {Object.entries(h.payment_summary)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-400">{PM_LABELS[k] ?? k}</span>
                          <span className="font-bold text-white tabular-nums">{fmtBRL(v)}</span>
                        </div>
                      ))}
                    <div className="border-t border-white/[0.06] pt-2 flex justify-between text-sm font-black">
                      <span className="text-gray-300">Abertura (troco)</span>
                      <span className="text-white">{fmtBRL(h.opening_balance)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black">
                      <span className="text-green-400">Total em caixa (dinheiro + abertura)</span>
                      <span className="text-green-400">{fmtBRL(h.closing_balance)}</span>
                    </div>
                    {h.notes && <p className="text-xs text-gray-500 italic mt-1">"{h.notes}"</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab Banco ─────────────────────────────────────────────────

function TabBanco() {
  const [balance,  setBalance]  = useState(null);
  const [txs,      setTxs]      = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [type,     setType]     = useState('credit');
  const [amount,   setAmount]   = useState('');
  const [desc,     setDesc]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, txRes] = await Promise.all([
        getBancoBalance(),
        getBancoTransactions({ limit: 50 }),
      ]);
      setBalance(balRes.data.data);
      setTxs(txRes.data.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!amount || parseFloat(amount) <= 0) { setErr('Informe um valor maior que zero.'); return; }
    if (!desc.trim()) { setErr('Informe uma descrição.'); return; }
    setSaving(true); setErr('');
    try {
      await addBancoTransaction({ type, amount: parseFloat(amount), description: desc.trim() });
      setAmount(''); setDesc(''); setShowForm(false);
      await load();
    } catch (e) { setErr(e?.response?.data?.message ?? 'Erro ao lançar.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este lançamento manual?')) return;
    try { await deleteBancoTransaction(id); setTxs(t => t.filter(x => x.id !== id)); }
    catch { alert('Não foi possível remover.'); }
  };

  const fmtDt = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const bal = parseFloat(balance?.balance ?? 0);

  return (
    <div className="flex flex-col h-full overflow-auto p-5 space-y-5">

      {/* Saldo */}
      <div className={`rounded-2xl border p-5 ${bal >= 0 ? 'bg-green-500/10 border-green-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Saldo em Banco</p>
            <p className={`text-3xl font-black ${bal >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtBRL(bal)}</p>
            <div className="flex gap-4 mt-2">
              <p className="text-xs text-gray-400">↑ Entradas: <span className="text-green-400 font-bold">{fmtBRL(balance?.total_in)}</span></p>
              <p className="text-xs text-gray-400">↓ Saídas: <span className="text-red-400 font-bold">{fmtBRL(balance?.total_out)}</span></p>
            </div>
          </div>
          <span className="text-4xl">🏦</span>
        </div>
      </div>

      {/* Botão lançamento manual */}
      <button onClick={() => setShowForm(v => !v)}
        className="w-full py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-gray-300 hover:bg-white/5 transition-colors">
        {showForm ? '✕ Cancelar' : '+ Lançamento Manual'}
      </button>

      {/* Form lançamento */}
      {showForm && (
        <div className="bg-gray-900/60 border border-white/[0.06] rounded-2xl p-4 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setType('credit')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${type === 'credit' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              ↑ Entrada
            </button>
            <button onClick={() => setType('debit')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${type === 'debit' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              ↓ Saída
            </button>
          </div>
          <input type="number" step="0.01" min="0" placeholder="Valor R$"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input type="text" placeholder="Descrição *"
            value={desc} onChange={e => setDesc(e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={handleAdd} disabled={saving}
            className={`w-full py-2.5 rounded-xl font-bold text-sm text-white transition-colors disabled:opacity-50 ${type === 'credit' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>
            {saving ? 'Lançando…' : `${type === 'credit' ? '↑ Confirmar Entrada' : '↓ Confirmar Saída'}`}
          </button>
        </div>
      )}

      {/* Extrato */}
      <div>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Extrato</h3>
        {txs.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8 italic">Nenhum lançamento ainda.<br/>Feche um caixa para ver a entrada automática.</p>
        ) : (
          <div className="space-y-2">
            {txs.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 bg-gray-900/40 border border-white/[0.05] rounded-xl px-4 py-3">
                <span className={`text-lg ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'credit' ? '↑' : '↓'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold truncate">{tx.description}</p>
                  <p className="text-xs text-gray-500">{fmtDt(tx.created_at)} · {tx.source === 'caixa' ? '🧾 Caixa' : tx.source === 'expense' ? '💸 Gasto' : '✏️ Manual'}</p>
                </div>
                <p className={`text-sm font-black tabular-nums ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'credit' ? '+' : '-'}{fmtBRL(tx.amount)}
                </p>
                {tx.source === 'manual' && (
                  <button onClick={() => handleDelete(tx.id)} className="text-gray-600 hover:text-red-400 transition-colors ml-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab Notas Fiscais (OCR IA) ────────────────────────────────

const STATUS_RECEIPT = {
  awaiting_confirmation: { label: 'Aguardando',  color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30' },
  confirmed:             { label: 'Confirmada',  color: 'text-green-400',  bg: 'bg-green-500/15  border-green-500/30'  },
  rejected:              { label: 'Rejeitada',   color: 'text-red-400',    bg: 'bg-red-500/15    border-red-500/30'    },
};

function TabNotas() {
  const { items, loading, error, refetch, removeLocal } = usePendingReceipts();
  const [selected,    setSelected]    = useState(null);
  const [showUpload,  setShowUpload]  = useState(false);

  const fmtDt = (s) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
  };

  const handleDone = (id, action) => {
    removeLocal(id);
    if (action === 'confirmed' || action === 'rejected') refetch();
  };

  const handleUploaded = (pending) => {
    refetch();
    // Abre modal de confirmação automaticamente após upload
    setSelected(pending);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-sm text-red-400">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-auto p-5 space-y-4">

      {/* Header + upload */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">Notas Fiscais via IA</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Envie fotos de notas pelo WhatsApp ou manualmente — a IA extrai e lança no estoque.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="btn-blue px-4 py-2 text-sm shrink-0"
        >
          📷 Enviar Nota
        </button>
      </div>

      {/* Banner dica WhatsApp */}
      <div className="flex gap-3 items-start bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3">
        <span className="text-xl shrink-0">💬</span>
        <div>
          <p className="text-sm font-semibold text-green-300">Envie pelo WhatsApp</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Mande a foto da nota diretamente no WhatsApp do estabelecimento — a IA processa e envia um resumo para confirmar.
          </p>
        </div>
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-3">🧾</span>
          <p className="text-sm font-semibold text-gray-300">Nenhuma nota pendente</p>
          <p className="text-xs text-gray-500 mt-1">
            Envie uma foto de nota fiscal para começar
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const raw    = r.raw_extraction ?? {};
            const conf   = Math.round((raw.confianca ?? 0) * 100);
            const st     = STATUS_RECEIPT[r.status] ?? STATUS_RECEIPT.awaiting_confirmation;
            const isPending = r.status === 'awaiting_confirmation';
            return (
              <button
                key={r.id}
                onClick={() => isPending && setSelected(r)}
                className={`w-full text-left bg-gray-800 rounded-xl border border-white/8 p-4 transition-all ${
                  isPending ? 'hover:border-orange-500/40 hover:bg-gray-700/60 cursor-pointer' : 'opacity-60 cursor-default'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">
                        {raw.fornecedor || 'Fornecedor desconhecido'}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                      {conf > 0 && conf < 80 && (
                        <span className="text-[10px] font-medium text-yellow-400">⚠️ {conf}% conf.</span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {r.sender_phone && (
                        <span className="text-xs text-gray-500">📱 {r.sender_phone}</span>
                      )}
                      {r.short_code && (
                        <span className="text-xs font-mono text-orange-400">#{r.short_code}</span>
                      )}
                      <span className="text-xs text-gray-500">{fmtDt(r.created_at)}</span>
                      {(r.matched_items ?? []).length > 0 && (
                        <span className="text-xs text-gray-500">
                          {r.matched_items.length} {r.matched_items.length === 1 ? 'item' : 'itens'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {raw.total > 0 && (
                      <p className="text-base font-black text-white tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(raw.total)}
                      </p>
                    )}
                    {isPending && (
                      <p className="text-xs text-orange-400 mt-1 font-medium">Toque para revisar →</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selected && (
          <ReceiptConfirmModal
            receipt={selected}
            onClose={() => setSelected(null)}
            onDone={handleDone}
          />
        )}
        {showUpload && (
          <ReceiptUploadModal
            onClose={() => setShowUpload(false)}
            onUploaded={handleUploaded}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

const TABS = [
  { id: 'caixa',     label: '🧾 Caixa'     },
  { id: 'receitas',  label: '📈 Receitas'  },
  { id: 'gastos',    label: '💸 Gastos'    },
  { id: 'resultado', label: '📊 Resultado' },
  { id: 'banco',     label: '🏦 Banco'     },
  { id: 'notas',     label: '📋 Notas'     },
];

export default function FinanceiroPage() {
  const [tab, setTab] = useState('caixa');
  const { items: pendingReceipts } = usePendingReceipts();
  const pendingCount = pendingReceipts.filter((r) => r.status === 'awaiting_confirmation').length;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <h1 className="text-lg font-black text-white">💰 Financeiro</h1>
        {pendingCount > 0 && (
          <button
            onClick={() => setTab('notas')}
            className="flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 rounded-full px-3 py-1 text-xs font-bold text-orange-400 hover:bg-orange-500/25 transition-colors"
          >
            🧾 {pendingCount} nota{pendingCount > 1 ? 's' : ''} pendente{pendingCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/[0.06] bg-gray-900/40 shrink-0 px-4 gap-1 pt-1 overflow-x-auto scrollbar-none">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
              tab === id
                ? 'border-orange-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
            {id === 'notas' && pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'caixa'     && <TabCaixa />}
        {tab === 'receitas'  && <TabReceitas />}
        {tab === 'gastos'    && <TabGastos />}
        {tab === 'resultado' && <TabResultado />}
        {tab === 'banco'     && <TabBanco />}
        {tab === 'notas'     && <TabNotas />}
      </div>
    </div>
  );
}
