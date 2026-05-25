import { useState, useEffect, useCallback, useMemo } from 'react';
import { listReservations, createReservation, updateReservation, deleteReservation } from '../api/reservations';
import { listTables } from '../api/users';

// ── Helpers ───────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:   { label: 'Pendente',   badge: 'bg-yellow-500/20 text-yellow-300', dot: 'bg-yellow-400' },
  confirmed: { label: 'Confirmada', badge: 'bg-green-500/20  text-green-300',  dot: 'bg-green-400' },
  seated:    { label: 'Sentado',    badge: 'bg-blue-500/20   text-blue-300',   dot: 'bg-blue-400' },
  cancelled: { label: 'Cancelada',  badge: 'bg-red-500/20    text-red-300',    dot: 'bg-red-400' },
  no_show:   { label: 'Não veio',   badge: 'bg-gray-700/60   text-gray-400',   dot: 'bg-gray-600' },
};

const TODAY = () => new Date().toISOString().slice(0, 10);

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const fmtPhone = (p) => {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
};

// ── Form Modal ────────────────────────────────────────────────

const EMPTY_FORM = {
  customerName: '',
  phone:        '',
  reservedAt:   '',
  partySize:    2,
  tableId:      '',
  notes:        '',
};

function ReservaModal({ reserva, tables, onClose, onSaved }) {
  const editing = Boolean(reserva?.id);
  const [form,    setForm]    = useState(reserva ? {
    customerName: reserva.customer_name,
    phone:        reserva.phone ?? '',
    reservedAt:   reserva.reserved_at?.slice(0, 16) ?? '',
    partySize:    reserva.party_size,
    tableId:      reserva.table_id ?? '',
    notes:        reserva.notes ?? '',
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        tableId:   form.tableId || undefined,
        notes:     form.notes || undefined,
        phone:     form.phone || undefined,
        partySize: Number(form.partySize),
      };
      if (editing) {
        await updateReservation(reserva.id, { ...payload, _prevStatus: reserva.status });
      } else {
        await createReservation(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Erro ao salvar reserva');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 rounded-3xl w-full max-w-md border border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-base font-black text-white">
            {editing ? 'Editar reserva' : 'Nova reserva'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{error}</div>
          )}

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Nome *</label>
              <input
                value={form.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                placeholder="Ex: João"
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">WhatsApp</label>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="(11) 9xxxx-xxxx"
                className="input w-full"
              />
            </div>
          </div>

          {/* Date/Time + Party size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Data e hora *</label>
              <input
                type="datetime-local"
                value={form.reservedAt}
                onChange={(e) => set('reservedAt', e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Pessoas *</label>
              <input
                type="number"
                min="1"
                max="50"
                value={form.partySize}
                onChange={(e) => set('partySize', e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          {/* Table */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Mesa (opcional)</label>
            <select
              value={form.tableId}
              onChange={(e) => set('tableId', e.target.value)}
              className="input w-full"
            >
              <option value="">— Sem mesa específica —</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>Mesa {t.number}{t.label ? ` — ${t.label}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Aniversário, cadeira de bebê..."
              rows={2}
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          {/* Status (editing only) */}
          {editing && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Status</label>
              <select
                value={form.status ?? reserva.status}
                onChange={(e) => set('status', e.target.value)}
                className="input w-full"
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              {form.status === 'confirmed' && reserva.status !== 'confirmed' && form.phone && (
                <p className="text-xs text-green-400 mt-1">
                  ✅ Confirmação será enviada por WhatsApp ao salvar
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-orange-500 text-white font-black hover:bg-orange-600 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Criar reserva')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reservation card ──────────────────────────────────────────

function ReservaCard({ reserva, onEdit, onDelete, onStatusChange }) {
  const cfg = STATUS_CONFIG[reserva.status] ?? STATUS_CONFIG.pending;
  const [deleting, setDeleting] = useState(false);

  const NEXT_STATUSES = {
    pending:   ['confirmed', 'cancelled'],
    confirmed: ['seated',    'no_show', 'cancelled'],
    seated:    [],
    cancelled: [],
    no_show:   [],
  };
  const next = NEXT_STATUSES[reserva.status] ?? [];

  return (
    <div className="bg-gray-800 rounded-2xl p-4 border border-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
            <p className="text-sm font-bold text-gray-100 truncate">{reserva.customer_name}</p>
          </div>
          {reserva.phone && (
            <p className="text-xs text-gray-500">{fmtPhone(reserva.phone)}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs bg-gray-700/60 text-gray-300 px-2 py-0.5 rounded-full font-medium">
              📅 {fmtDateTime(reserva.reserved_at)}
            </span>
            <span className="text-xs bg-gray-700/60 text-gray-300 px-2 py-0.5 rounded-full font-medium">
              👥 {reserva.party_size} pessoa{reserva.party_size !== 1 ? 's' : ''}
            </span>
            {(reserva.table_number || reserva.table_label) && (
              <span className="text-xs bg-orange-500/15 text-orange-300 px-2 py-0.5 rounded-full font-medium">
                🪑 Mesa {reserva.table_number}{reserva.table_label ? ` (${reserva.table_label})` : ''}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          {reserva.notes && (
            <p className="text-xs text-gray-500 italic mt-1 truncate">"{reserva.notes}"</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(reserva)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors"
            title="Editar"
          >
            ✏️
          </button>
          {deleting ? (
            <button
              onClick={() => { setDeleting(false); onDelete(reserva.id); }}
              className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 font-semibold"
            >OK</button>
          ) : (
            <button
              onClick={() => setDeleting(true)}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Excluir"
            >🗑</button>
          )}
        </div>
      </div>

      {/* Quick status actions */}
      {next.length > 0 && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
          {next.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(reserva, s)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                s === 'cancelled' || s === 'no_show'
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : s === 'confirmed'
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                    : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
              }`}
            >
              {STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function ReservasPage() {
  const [reservations, setReservations] = useState([]);
  const [tables,       setTables]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [dateFilter,   setDateFilter]   = useState(TODAY());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t] = await Promise.all([
        listReservations({ date: dateFilter }),
        listTables(),
      ]);
      setReservations(r.data.data ?? r.data);
      setTables(t.data.data ?? t.data);
    } catch {
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  const handleNew    = () => { setEditing(null); setShowModal(true); };
  const handleEdit   = (r) => { setEditing(r); setShowModal(true); };
  const handleClose  = () => { setShowModal(false); setEditing(null); };

  const handleDelete = async (id) => {
    try { await deleteReservation(id); load(); } catch { /* silent */ }
  };

  const handleStatusChange = async (reserva, newStatus) => {
    try {
      await updateReservation(reserva.id, { status: newStatus, _prevStatus: reserva.status });
      load();
    } catch { /* silent */ }
  };

  // ── Group by status for display ────────────────────────────
  const active   = useMemo(() => reservations.filter((r) => !['cancelled', 'no_show'].includes(r.status)), [reservations]);
  const inactive = useMemo(() => reservations.filter((r) =>  ['cancelled', 'no_show'].includes(r.status)), [reservations]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white">📅 Reservas</h1>
          <p className="text-xs text-gray-500 mt-0.5">Gestão de reservas de mesa</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
          />
          <button onClick={handleNew} className="btn-green flex items-center gap-2">
            <span>+</span>Nova reserva
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">📅</span>
            <p className="text-base font-semibold">Nenhuma reserva para {new Date(dateFilter + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
            <button onClick={handleNew} className="btn-green mt-2">Criar reserva</button>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Active */}
            {active.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Ativas ({active.length})
                </h2>
                {active.map((r) => (
                  <ReservaCard
                    key={r.id}
                    reserva={r}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}

            {/* Cancelled / no show */}
            {inactive.length > 0 && (
              <div className="space-y-3 opacity-60">
                <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Canceladas / Não compareceu ({inactive.length})
                </h2>
                {inactive.map((r) => (
                  <ReservaCard
                    key={r.id}
                    reserva={r}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <ReservaModal
          reserva={editing}
          tables={tables}
          onClose={handleClose}
          onSaved={load}
        />
      )}
    </div>
  );
}
