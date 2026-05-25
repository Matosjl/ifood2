import { useState, useEffect, useCallback } from 'react';
import { listPromotions, createPromotion, updatePromotion, deletePromotion } from '../api/promotions';

// ── Helpers ───────────────────────────────────────────────────

const fmt = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const TYPE_LABELS = {
  happy_hour:        '🕐 Happy Hour',
  product_discount:  '🏷️ Produto específico',
  category_discount: '📦 Categoria inteira',
};

const TYPE_DESCRIPTIONS = {
  happy_hour:        'Desconto em todos os itens durante um horário específico',
  product_discount:  'Desconto em produtos selecionados',
  category_discount: 'Desconto em todos os produtos de uma categoria',
};

const EMPTY_FORM = {
  name:          '',
  type:          'happy_hour',
  discountType:  'percent',
  discountValue: 10,
  active:        true,
  conditions: {
    days:       [1, 2, 3, 4, 5],
    start_time: '17:00',
    end_time:   '19:00',
    product_ids:  [],
    category_ids: [],
  },
};

// ── Promotion Form Modal ──────────────────────────────────────

function PromoModal({ promo, onClose, onSaved }) {
  const editing = Boolean(promo?.id);
  const [form, setForm] = useState(promo ? {
    name:          promo.name,
    type:          promo.type,
    discountType:  promo.discount_type,
    discountValue: promo.discount_value,
    active:        promo.active,
    conditions:    promo.conditions ?? {},
  } : { ...EMPTY_FORM, conditions: { ...EMPTY_FORM.conditions } });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setCond = (key, val) => setForm((f) => ({ ...f, conditions: { ...f.conditions, [key]: val } }));

  const toggleDay = (day) => {
    const days = form.conditions.days ?? [];
    setCond('days', days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updatePromotion(promo.id, form);
      } else {
        await createPromotion(form);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Erro ao salvar promoção');
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
      <div className="bg-gray-900 rounded-3xl w-full max-w-lg border border-white/[0.08] max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 px-5 py-4 border-b border-white/[0.06] flex items-center justify-between z-10">
          <h2 className="text-base font-black text-white">
            {editing ? 'Editar promoção' : 'Nova promoção'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{error}</div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Nome da promoção</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Happy Hour das 17h"
              className="input w-full"
            />
          </div>

          {/* Type */}
          {!editing && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Tipo</label>
              <div className="space-y-2">
                {Object.entries(TYPE_LABELS).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => set('type', k)}
                    className={`w-full flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-colors ${
                      form.type === k
                        ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                        : 'bg-gray-800 border-white/10 text-gray-300 hover:border-white/20'
                    }`}
                  >
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-xs text-gray-500 mt-0.5">{TYPE_DESCRIPTIONS[k]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discount */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Desconto</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.discountValue}
                onChange={(e) => set('discountValue', Number(e.target.value))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Tipo</label>
              <select
                value={form.discountType}
                onChange={(e) => set('discountType', e.target.value)}
                className="input"
              >
                <option value="percent">% Percentual</option>
                <option value="fixed">R$ Fixo</option>
              </select>
            </div>
          </div>

          {/* Happy Hour conditions */}
          {form.type === 'happy_hour' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Dias da semana</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_SHORT.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        (form.conditions.days ?? []).includes(i)
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Início</label>
                  <input
                    type="time"
                    value={form.conditions.start_time ?? '17:00'}
                    onChange={(e) => setCond('start_time', e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Fim</label>
                  <input
                    type="time"
                    value={form.conditions.end_time ?? '19:00'}
                    onChange={(e) => setCond('end_time', e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {form.type === 'product_discount' && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm text-yellow-300">
              <p className="font-semibold mb-1">💡 Dica</p>
              <p className="text-xs text-yellow-300/80">
                Os IDs dos produtos específicos podem ser configurados diretamente via API.
                Em breve teremos um seletor visual aqui.
              </p>
            </div>
          )}

          {form.type === 'category_discount' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-300">
              <p className="font-semibold mb-1">💡 Dica</p>
              <p className="text-xs text-blue-300/80">
                As categorias podem ser selecionadas diretamente via API.
                Em breve teremos um seletor visual aqui.
              </p>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between bg-gray-800 rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-100">Promoção ativa</p>
              <p className="text-xs text-gray-500">Desativada = não será aplicada</p>
            </div>
            <button
              onClick={() => set('active', !form.active)}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.active ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-orange-500 text-white font-black hover:bg-orange-600 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Criar promoção')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Promotion card ────────────────────────────────────────────

function PromoCard({ promo, onEdit, onToggle, onDelete }) {
  const cond = promo.conditions ?? {};
  const [deleting, setDeleting] = useState(false);

  return (
    <div className={`bg-gray-800 rounded-2xl p-4 border ${promo.active ? 'border-white/[0.06]' : 'border-white/[0.03] opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${promo.active ? 'bg-green-400' : 'bg-gray-600'}`} />
            <p className="text-sm font-bold text-gray-100 truncate">{promo.name}</p>
          </div>
          <p className="text-xs text-gray-400">{TYPE_LABELS[promo.type] ?? promo.type}</p>

          {/* Summary */}
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs bg-orange-500/15 text-orange-300 px-2 py-0.5 rounded-full font-semibold">
              {promo.discount_type === 'percent'
                ? `${promo.discount_value}% off`
                : `${fmt(promo.discount_value)} off`}
            </span>
            {promo.type === 'happy_hour' && cond.start_time && (
              <span className="text-xs bg-gray-700/60 text-gray-400 px-2 py-0.5 rounded-full">
                {cond.start_time}–{cond.end_time}
              </span>
            )}
            {promo.type === 'happy_hour' && Array.isArray(cond.days) && (
              <span className="text-xs bg-gray-700/60 text-gray-400 px-2 py-0.5 rounded-full">
                {cond.days.map((d) => DAYS_SHORT[d]).join(' · ')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(promo)}
            className={`text-xs px-2 py-1 rounded-lg font-semibold transition-colors ${
              promo.active
                ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
            }`}
          >
            {promo.active ? 'Ativo' : 'Inativo'}
          </button>
          <button
            onClick={() => onEdit(promo)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors text-sm"
          >
            ✏️
          </button>
          {deleting ? (
            <button
              onClick={() => { setDeleting(false); onDelete(promo.id); }}
              className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold"
            >
              Confirmar
            </button>
          ) : (
            <button
              onClick={() => setDeleting(true)}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function PromocoesPage() {
  const [promotions, setPromotions] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listPromotions();
      setPromotions(data.data ?? data);
    } catch {
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (promo) => {
    try {
      await updatePromotion(promo.id, { active: !promo.active });
      load();
    } catch { /* silent */ }
  };

  const handleDelete = async (id) => {
    try {
      await deletePromotion(id);
      load();
    } catch { /* silent */ }
  };

  const handleEdit = (promo) => {
    setEditing(promo);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditing(null);
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditing(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl font-black text-white">🏷️ Promoções</h1>
          <p className="text-xs text-gray-500 mt-0.5">Happy hour, descontos automáticos por horário ou produto</p>
        </div>
        <button onClick={handleNew} className="btn-green flex items-center gap-2">
          <span className="text-base">+</span>
          Nova promoção
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : promotions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">🏷️</span>
            <p className="text-base font-semibold">Nenhuma promoção criada</p>
            <p className="text-sm text-center max-w-xs">
              Crie promoções de happy hour ou descontos específicos por produto e categoria.
              Elas são aplicadas automaticamente nos pedidos.
            </p>
            <button onClick={handleNew} className="btn-green mt-2">Criar primeira promoção</button>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            {/* Active count */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-semibold text-green-400">
                  {promotions.filter((p) => p.active).length} ativas
                </span>
              </div>
              <span className="text-xs text-gray-600">{promotions.length} total</span>
            </div>

            {promotions.map((promo) => (
              <PromoCard
                key={promo.id}
                promo={promo}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <PromoModal
          promo={editing}
          onClose={handleClose}
          onSaved={load}
        />
      )}
    </div>
  );
}
