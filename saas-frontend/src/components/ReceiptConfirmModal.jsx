import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { confirmReceipt, rejectReceipt, editReceipt, fetchReceiptImage } from '../api/receipts';
import { listInsumos } from '../api/insumos';

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
  auto:        { label: 'Encontrado',     color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30'  },
  auto_match:  { label: 'Encontrado',     color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30'  },
  ask:         { label: 'Revisar',        color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30' },
  create_new:  { label: 'Não cadastrado', color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30'    },
};

function MatchBadge({ type }) {
  const m = MATCH_LABELS[type] ?? MATCH_LABELS.create_new;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.bg} ${m.color}`}>
      {m.label}
    </span>
  );
}

// ── Busca inline de insumo ────────────────────────────────────
function InsumoSearch({ insumos, onSelect, onClose }) {
  const [q, setQ]         = useState('');
  const inputRef          = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = q.trim().length < 1
    ? insumos.slice(0, 8)
    : insumos.filter((i) =>
        i.name.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8);

  return (
    <div className="mt-2 bg-gray-900 border border-white/10 rounded-xl overflow-hidden shadow-xl">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span className="text-gray-400 text-sm">🔍</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          placeholder="Buscar insumo no estoque…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-xs px-1"
        >
          ✕
        </button>
      </div>
      <div className="max-h-44 overflow-y-auto">
        {results.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-3">Nenhum insumo encontrado</p>
        ) : (
          results.map((ins) => (
            <button
              key={ins.id}
              onClick={() => onSelect(ins)}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors
                         flex items-center justify-between gap-3 border-b border-white/5 last:border-0"
            >
              <span className="font-medium truncate">{ins.name}</span>
              <span className="text-xs text-gray-500 shrink-0">
                {parseFloat(ins.qty_in_stock ?? 0).toFixed(2)} {ins.unit}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Linha de item ─────────────────────────────────────────────
function ItemRow({ item, editing, onChange, insumos, searchOpenFor, onToggleSearch }) {
  const actionKey = item.action ?? 'create_new';
  const isAsk     = actionKey === 'ask';

  const handleSelectInsumo = (ins) => {
    onChange({
      ...item,
      action:     'auto',
      match_id:   ins.id,
      match_name: ins.name,
      match_type: 'insumo',
    });
    onToggleSearch(null);
  };

  if (!editing) {
    return (
      <div className="py-2.5 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-white font-medium truncate">
                {item.descricao || 'Item sem nome'}
              </span>
              <MatchBadge type={actionKey} />
            </div>
            {item.match_name && actionKey !== 'create_new' && (
              <p className="text-xs text-gray-400 mt-0.5">→ {item.match_name}</p>
            )}
          </div>
          <div className="text-right shrink-0 flex items-center gap-2">
            <div>
              <p className="text-xs text-gray-400 tabular-nums">
                {item.quantidade} {item.unidade ?? 'un'}
              </p>
              <p className="text-sm font-bold text-white tabular-nums">{fmtBRL(item.valor_total)}</p>
            </div>
            {/* Botão de match inline — só para itens ask */}
            {isAsk && (
              <button
                onClick={() => onToggleSearch(searchOpenFor ? null : item)}
                title="Buscar insumo no estoque"
                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm
                            transition-colors border
                            ${searchOpenFor
                              ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300'
                              : 'bg-gray-700 border-white/10 text-gray-400 hover:text-white hover:bg-gray-600'}`}
              >
                🔍
              </button>
            )}
          </div>
        </div>

        {/* Busca inline expandida */}
        {isAsk && searchOpenFor && (
          <InsumoSearch
            insumos={insumos}
            onSelect={handleSelectInsumo}
            onClose={() => onToggleSearch(null)}
          />
        )}
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
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <MatchBadge type={actionKey} />
        {item.match_name && (
          <span className="text-xs text-gray-400">→ {item.match_name}</span>
        )}
        {/* Botão de busca também no modo edição */}
        {isAsk && (
          <button
            onClick={() => onToggleSearch(searchOpenFor ? null : item)}
            className="text-xs text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
          >
            🔍 Vincular insumo
          </button>
        )}
      </div>
      {isAsk && searchOpenFor && (
        <InsumoSearch
          insumos={insumos}
          onSelect={handleSelectInsumo}
          onClose={() => onToggleSearch(null)}
        />
      )}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────
export default function ReceiptConfirmModal({ receipt, onClose, onDone }) {
  const [imageUrl,    setImageUrl]    = useState(null);
  const [items,       setItems]       = useState([]);
  const [editing,     setEditing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [rejecting,   setRejecting]   = useState(false);
  const [err,         setErr]         = useState('');
  const [insumos,     setInsumos]     = useState([]);
  const [searchItem,  setSearchItem]  = useState(null); // item com busca aberta

  const raw  = receipt.raw_extraction ?? {};
  const conf = Math.round((raw.confianca ?? 0) * 100);

  useEffect(() => {
    if (receipt.image_url || receipt.image_bytes) {
      fetchReceiptImage(receipt.id).then(setImageUrl).catch(() => {});
    }
    const mi = receipt.matched_items ?? [];
    setItems(mi.map((it) => ({
      ...it,
      descricao:   it.raw?.descricao   ?? it.descricao   ?? '',
      quantidade:  it.raw?.quantidade  ?? it.quantidade  ?? 0,
      unidade:     it.raw?.unidade     ?? it.unidade     ?? 'un',
      valor_unit:  it.raw?.valor_unit  ?? it.valor_unit  ?? 0,
      valor_total: it.raw?.valor_total ?? it.valor_total ?? 0,
    })));

    // Carrega insumos para busca inline
    listInsumos().then((res) => {
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setInsumos(list.sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, [receipt.id]);

  // ── Feature 2: Aprovar todos os sugeridos ─────────────────────
  // Itens ask que já têm uma sugestão de match (match_id != null)
  const askWithSuggestion = items.filter(
    (it) => it.action === 'ask' && it.match_id
  );
  const askWithoutMatch = items.filter(
    (it) => it.action === 'ask' && !it.match_id
  );

  const handleApproveAll = async () => {
    const next = items.map((it) =>
      it.action === 'ask' && it.match_id
        ? { ...it, action: 'auto' }
        : it
    );
    setItems(next);
    // Salva imediatamente para não perder se fechar acidentalmente
    try {
      const itemsToSave = next.map((it) => ({
        ...it,
        raw: { ...(it.raw ?? {}), descricao: it.descricao, quantidade: it.quantidade,
               unidade: it.unidade, valor_unit: it.valor_unit, valor_total: it.valor_total },
      }));
      await editReceipt(receipt.id, { matched_items: itemsToSave });
    } catch { /* silencioso — itens já estão atualizados em tela */ }
  };

  const handleConfirm = async () => {
    setSaving(true); setErr('');
    try {
      const itemsToSave = items.map((it) => ({
        ...it,
        raw: { ...(it.raw ?? {}), descricao: it.descricao, quantidade: it.quantidade,
               unidade: it.unidade, valor_unit: it.valor_unit, valor_total: it.valor_total },
      }));
      await editReceipt(receipt.id, { matched_items: itemsToSave });
      await confirmReceipt(receipt.id);
      onDone(receipt.id, 'confirmed');
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Erro ao confirmar.');
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

  const askItems    = items.filter((it) => it.action === 'ask');
  const canConfirm  = askItems.length === 0;

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
            <h2 className="text-base font-bold text-white">🧾 Confirmar Nota Fiscal</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {receipt.sender_phone
                ? `Recebida de ${receipt.sender_phone} via WhatsApp`
                : 'Enviada manualmente'}
              {receipt.short_code && (
                <span className="ml-2 font-mono text-orange-400">#{receipt.short_code}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Aviso OCR */}
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
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                Itens ({items.length})
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Feature 2: Aprovar todos com sugestão */}
                {askWithSuggestion.length > 0 && (
                  <button
                    onClick={handleApproveAll}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors
                               bg-green-500/20 text-green-400 border border-green-500/30
                               hover:bg-green-500/30"
                    title={`Aceitar as ${askWithSuggestion.length} sugestões automáticas`}
                  >
                    ✅ Aprovar {askWithSuggestion.length} sugerido{askWithSuggestion.length > 1 ? 's' : ''}
                  </button>
                )}
                {/* Aviso itens sem match */}
                {askWithoutMatch.length > 0 && (
                  <span className="text-xs text-yellow-400 font-medium">
                    🔍 {askWithoutMatch.length} {askWithoutMatch.length === 1 ? 'item precisa' : 'itens precisam'} de vínculo
                  </span>
                )}
                {/* Aviso itens com sugestão */}
                {askWithSuggestion.length > 0 && askWithoutMatch.length === 0 && (
                  <span className="text-xs text-yellow-400 font-medium">
                    ⚠️ {askWithSuggestion.length} {askWithSuggestion.length === 1 ? 'item aguarda' : 'itens aguardam'} aprovação
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
              <div>
                {items.map((item, i) => (
                  <ItemRow
                    key={i}
                    item={item}
                    editing={editing}
                    insumos={insumos}
                    searchOpenFor={searchItem === item}
                    onToggleSearch={(target) => setSearchItem(target)}
                    onChange={(updated) => {
                      setItems((prev) => {
                        const next = [...prev];
                        next[i] = updated;
                        return next;
                      });
                      // Se o item foi resolvido via busca, fecha a busca
                      if (updated.action === 'auto') setSearchItem(null);
                    }}
                  />
                ))}
              </div>
            )}

            {/* Legenda inline quando há itens ask sem match */}
            {askWithoutMatch.length > 0 && (
              <p className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-white/5">
                Clique em 🔍 para vincular o item ao insumo correto no estoque.
              </p>
            )}
          </div>

          {/* Preview imagem */}
          {imageUrl && (
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold px-3 pt-3 mb-2">
                Imagem da Nota
              </p>
              <img src={imageUrl} alt="Nota Fiscal" className="w-full max-h-64 object-contain" />
            </div>
          )}

          {err && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex gap-3 justify-between items-center shrink-0">
          {/* Info de bloqueio */}
          <div className="text-xs text-gray-500">
            {!canConfirm && (
              <span className="text-yellow-400">
                ⚠️ Resolva os {askItems.length} {askItems.length === 1 ? 'item' : 'itens'} pendentes para confirmar
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={rejecting || saving}
              className="btn-red px-4 py-2 text-sm disabled:opacity-50"
            >
              {rejecting ? 'Rejeitando…' : '✗ Rejeitar'}
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || rejecting || !canConfirm}
              className="btn-green px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canConfirm ? 'Resolva os itens pendentes primeiro' : ''}
            >
              {saving ? 'Confirmando…' : '✓ Confirmar e Lançar'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
