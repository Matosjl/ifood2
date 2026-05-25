import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { confirmReceipt, rejectReceipt, editReceipt, fetchReceiptImage } from '../api/receipts';

const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d.toString().substring(0, 10) + 'T12:00:00');
    return dt.toLocaleDateString('pt-BR');
  } catch { return d; }
};

const MATCH_LABELS = {
  auto_match:  { label: 'Encontrado',  color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30'  },
  ask:         { label: 'Sugestão',    color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30' },
  create_new:  { label: 'Criar novo',  color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30'    },
};

function MatchBadge({ type }) {
  const m = MATCH_LABELS[type] ?? MATCH_LABELS.create_new;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.bg} ${m.color}`}>
      {m.label}
    </span>
  );
}

function ItemRow({ item, editing, onChange }) {
  if (!editing) {
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-white font-medium truncate">{item.descricao || 'Item sem nome'}</span>
            <MatchBadge type={item.match_type} />
          </div>
          {item.matched_name && item.match_type !== 'create_new' && (
            <p className="text-xs text-gray-400 mt-0.5">→ {item.matched_name}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400 tabular-nums">
            {item.quantidade} {item.unidade ?? 'un'}
          </p>
          <p className="text-sm font-bold text-white tabular-nums">{fmtBRL(item.valor_total)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2 border-b border-white/5 last:border-0 space-y-1">
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          value={item.descricao ?? ''}
          placeholder="Descrição"
          onChange={(e) => onChange({ ...item, descricao: e.target.value })}
        />
        <input
          className="input w-20 text-sm tabular-nums"
          value={item.quantidade ?? ''}
          placeholder="Qtd"
          type="number" min="0" step="0.001"
          onChange={(e) => onChange({ ...item, quantidade: parseFloat(e.target.value) || 0 })}
        />
        <input
          className="input w-24 text-sm tabular-nums"
          value={item.valor_unit ?? ''}
          placeholder="R$ unit"
          type="number" min="0" step="0.01"
          onChange={(e) => {
            const vu = parseFloat(e.target.value) || 0;
            onChange({ ...item, valor_unit: vu, valor_total: vu * (item.quantidade || 1) });
          }}
        />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <MatchBadge type={item.match_type} />
        {item.matched_name && (
          <span className="text-xs text-gray-400">→ {item.matched_name}</span>
        )}
      </div>
    </div>
  );
}

export default function ReceiptConfirmModal({ receipt, onClose, onDone }) {
  const [imageUrl,  setImageUrl]  = useState(null);
  const [items,     setItems]     = useState([]);
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [err,       setErr]       = useState('');

  const raw  = receipt.raw_extraction ?? {};
  const conf = Math.round((raw.confianca ?? 0) * 100);

  useEffect(() => {
    // Tenta carregar imagem se disponível
    if (receipt.image_url || receipt.image_bytes) {
      fetchReceiptImage(receipt.id)
        .then(setImageUrl)
        .catch(() => {/* sem imagem */});
    }
    // Carrega itens do matched_items
    const mi = receipt.matched_items ?? [];
    setItems(mi.map((it) => ({ ...it })));
  }, [receipt.id]);

  const handleConfirm = async () => {
    setSaving(true); setErr('');
    try {
      if (editing) {
        await editReceipt(receipt.id, { matched_items: items });
      }
      await confirmReceipt(receipt.id);
      onDone(receipt.id, 'confirmed');
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Erro ao confirmar.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true); setErr('');
    try {
      await rejectReceipt(receipt.id, 'Rejeitado pelo usuário');
      onDone(receipt.id, 'rejected');
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Erro ao rejeitar.');
    } finally {
      setRejecting(false);
    }
  };

  const askItems = items.filter((it) => it.match_type === 'ask');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -12 }}
        animate={{ opacity: 1, scale: 1,    y: 0    }}
        exit={{    opacity: 0, scale: 0.97, y: -12  }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">
              🧾 Confirmar Nota Fiscal
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {receipt.sender_phone
                ? `Recebida de ${receipt.sender_phone} via WhatsApp`
                : 'Enviada manualmente'}
              {receipt.short_code && (
                <span className="ml-2 font-mono text-orange-400">#{receipt.short_code}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Aviso confiança */}
          {conf < 80 && (
            <div className="flex gap-2 items-start bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3">
              <span className="text-yellow-400 mt-0.5 shrink-0">⚠️</span>
              <p className="text-xs text-yellow-300">
                Confiança OCR: <strong>{conf}%</strong> — revise os dados antes de confirmar.
              </p>
            </div>
          )}

          {/* Info principal */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Fornecedor</p>
              <p className="text-sm text-white font-medium">{raw.fornecedor || '—'}</p>
              {raw.cnpj && <p className="text-xs text-gray-500 mt-0.5 font-mono">{raw.cnpj}</p>}
            </div>
            <div className="bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Data / Total</p>
              <p className="text-sm text-white font-medium">{fmtDate(raw.data_emissao)}</p>
              <p className="text-lg font-black text-green-400 tabular-nums mt-0.5">{fmtBRL(raw.total)}</p>
            </div>
          </div>

          {/* Itens */}
          <div className="bg-gray-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                Itens ({items.length})
              </p>
              <div className="flex gap-2">
                {askItems.length > 0 && (
                  <span className="text-xs text-yellow-400 font-medium">
                    ⚠️ {askItems.length} {askItems.length === 1 ? 'item precisa' : 'itens precisam'} de revisão
                  </span>
                )}
                <button
                  onClick={() => setEditing(!editing)}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                    editing
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {editing ? '✓ Editando' : '✏️ Editar'}
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum item extraído</p>
            ) : (
              <div className="divide-y divide-white/0">
                {items.map((item, i) => (
                  <ItemRow
                    key={i}
                    item={item}
                    editing={editing}
                    onChange={(updated) => setItems((prev) => {
                      const next = [...prev];
                      next[i] = updated;
                      return next;
                    })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview imagem */}
          {imageUrl && (
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold px-3 pt-3 mb-2">
                Imagem da Nota
              </p>
              <img
                src={imageUrl}
                alt="Nota Fiscal"
                className="w-full max-h-64 object-contain"
              />
            </div>
          )}

          {err && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex gap-3 justify-end shrink-0">
          <button
            onClick={handleReject}
            disabled={rejecting || saving}
            className="btn-red px-4 py-2 text-sm disabled:opacity-50"
          >
            {rejecting ? 'Rejeitando…' : '✗ Rejeitar'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || rejecting}
            className="btn-green px-5 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Confirmando…' : '✓ Confirmar e Lançar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
