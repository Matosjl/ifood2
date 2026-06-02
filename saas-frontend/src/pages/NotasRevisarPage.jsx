'use strict';
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getRevisarReceipts } from '../api/receipts';
import ReceiptConfirmModal  from '../components/ReceiptConfirmModal';
import ResolveItemModal     from '../components/ResolveItemModal';

const fmtBRL = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDt = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
};

// ── Configuração visual por status ────────────────────────────────
const STATUS_CONFIG = {
  awaiting_confirmation: {
    label:   'Aguardando confirmação',
    icon:    '⏳',
    color:   'text-yellow-400',
    bg:      'bg-yellow-500/10 border-yellow-500/25',
    badgeBg: 'bg-yellow-500/20 border-yellow-500/40',
  },
  extraction_failed: {
    label:   'OCR falhou',
    icon:    '❌',
    color:   'text-red-400',
    bg:      'bg-red-500/10 border-red-500/25',
    badgeBg: 'bg-red-500/20 border-red-500/40',
  },
  confirmed: {
    label:   'Itens não cadastrados',
    icon:    '🆕',
    color:   'text-blue-400',
    bg:      'bg-blue-500/10 border-blue-500/25',
    badgeBg: 'bg-blue-500/20 border-blue-500/40',
  },
};

// ── Linha de resumo da nota ────────────────────────────────────────
function ReceiptRow({ receipt, onSelect, onResolveItems }) {
  const cfg   = STATUS_CONFIG[receipt.status] ?? STATUS_CONFIG.awaiting_confirmation;
  const raw   = receipt.raw_extraction ?? {};
  const items = receipt.matched_items  ?? [];

  const total        = raw.total ? fmtBRL(raw.total) : '—';
  const fornecedor   = raw.fornecedor || (receipt.sender_phone ? `WhatsApp ${receipt.sender_phone}` : 'Upload manual');
  const date         = fmtDt(receipt.confirmed_at ?? receipt.created_at);

  // Contagens por tipo
  const askCount     = items.filter((m) => m.action === 'ask').length;
  const newCount     = items.filter((m) => m.action === 'create_new').length;
  const autoCount    = items.filter((m) => m.action === 'auto').length;

  // Motivo de bloqueio em texto curto
  let motivo = null;
  if (receipt.status === 'extraction_failed') {
    motivo = 'OCR não conseguiu ler a nota — envie novamente ou cadastre manualmente.';
  } else if (askCount > 0) {
    motivo = `${askCount} ${askCount === 1 ? 'item precisa' : 'itens precisam'} de correspondência manual.`;
  } else if (newCount > 0 && receipt.status === 'confirmed') {
    motivo = `${newCount} ${newCount === 1 ? 'item não foi' : 'itens não foram'} lançados no estoque.`;
  }

  const canConfirm = receipt.status === 'awaiting_confirmation';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} transition-colors`}
    >
      {/* Ícone status */}
      <span className="text-xl mt-0.5 shrink-0">{cfg.icon}</span>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white truncate">{fornecedor}</span>
          {receipt.short_code && (
            <span className="text-[10px] font-mono text-orange-400 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded">
              #{receipt.short_code}
            </span>
          )}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.badgeBg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span>💰 {total}</span>
          {items.length > 0 && (
            <>
              {autoCount > 0 && <span className="text-green-400">✅ {autoCount} ok</span>}
              {askCount  > 0 && <span className="text-yellow-400">❓ {askCount} revisar</span>}
              {newCount  > 0 && <span className="text-blue-400">🆕 {newCount} não cadastrado</span>}
            </>
          )}
          <span className="text-gray-600">{date}</span>
        </div>

        {motivo && (
          <p className="text-xs text-gray-400 italic">{motivo}</p>
        )}
      </div>

      {/* Ação */}
      {canConfirm && (
        <button
          onClick={() => onSelect(receipt)}
          className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400
                     border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
        >
          Revisar →
        </button>
      )}
      {receipt.status === 'confirmed' && (
        <button
          onClick={() => onResolveItems(receipt)}
          className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400
                     border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
        >
          🆕 Resolver
        </button>
      )}
    </motion.div>
  );
}

// ── Seção agrupada ────────────────────────────────────────────────
function Section({ title, icon, items, onSelect, onResolveItems, emptyMsg }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-base">{icon}</span>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-gray-600 font-mono">({items.length})</span>
      </div>
      {items.map((r) => (
        <ReceiptRow key={r.id} receipt={r} onSelect={onSelect} onResolveItems={onResolveItems} />
      ))}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────
export default function NotasRevisarPage() {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selected,      setSelected]      = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null); // { receipt, item, itemIdx }

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await getRevisarReceipts();
      setItems(Array.isArray(data?.data) ? data.data : []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleResolved = (updatedData) => {
    // Atualiza o receipt localmente com os matched_items novos
    setItems(prev => prev.map(r =>
      r.id === updatedData.pending?.id
        ? { ...r, matched_items: updatedData.pending.matched_items }
        : r
    ));
    setResolveTarget(null);
    // Re-sincroniza para remover da lista se todos create_new foram resolvidos
    fetchAll();
  };

  const handleDone = (id, action) => {
    // Remove ou atualiza localmente após confirmação/rejeição
    if (action === 'confirmed' || action === 'rejected') {
      setItems((prev) => prev.filter((r) => r.id !== id));
    }
    setSelected(null);
    fetchAll(); // re-sincroniza
  };

  // Agrupa por status na ordem correta
  const awaiting  = items.filter((r) => r.status === 'awaiting_confirmation');
  const failed    = items.filter((r) => r.status === 'extraction_failed');
  const confirmed = items.filter((r) => r.status === 'confirmed');
  const total     = items.length;

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-950">
      <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              📄 Notas para Revisar
              {total > 0 && (
                <span className="text-sm font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30
                                 px-2 py-0.5 rounded-full">
                  {total}
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Notas fiscais que precisam de ação: confirmação pendente, OCR com falha ou itens não cadastrados.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="shrink-0 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg
                       bg-gray-800 hover:bg-gray-700 transition-colors border border-white/5"
          >
            🔄 Atualizar
          </button>
        </div>

        {/* Estado: loading */}
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Estado: erro */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Estado: sem pendências */}
        {!loading && !error && total === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-semibold text-white">Tudo em dia!</p>
            <p className="text-xs text-gray-400">Não há notas aguardando revisão.</p>
          </div>
        )}

        {/* Listas por seção */}
        {!loading && !error && total > 0 && (
          <div className="space-y-6">
            <Section
              title="Aguardando confirmação"
              icon="⏳"
              items={awaiting}
              onSelect={setSelected}
            />
            <Section
              title="OCR falhou — verificar manualmente"
              icon="❌"
              items={failed}
              onSelect={setSelected}
            />
            <Section
              title="Confirmadas com itens não cadastrados"
              icon="🆕"
              items={confirmed}
              onSelect={setSelected}
              onResolveItems={(r) => {
                const createNewItems = (r.matched_items || [])
                  .map((m, idx) => ({ ...m, idx }))
                  .filter(m => m.action === 'create_new');
                if (createNewItems.length > 0) {
                  setResolveTarget({ receipt: r, item: createNewItems[0], itemIdx: createNewItems[0].idx });
                }
              }}
            />
          </div>
        )}

        {/* Legenda */}
        {!loading && total > 0 && (
          <div className="bg-gray-900 border border-white/5 rounded-xl px-4 py-3 space-y-1">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Legenda</p>
            <p className="text-xs text-gray-400">✅ Item reconhecido automaticamente — estoque será atualizado ao confirmar.</p>
            <p className="text-xs text-gray-400">❓ Item com correspondência incerta — precisa escolher o insumo correto antes de confirmar.</p>
            <p className="text-xs text-gray-400">🆕 Item não reconhecido — financeiro é lançado, mas estoque <strong>não</strong> é alterado. Cadastre o insumo manualmente.</p>
          </div>
        )}
      </div>

      {/* Modal de resolução de item create_new */}
      <AnimatePresence>
        {resolveTarget && (
          <ResolveItemModal
            receiptId={resolveTarget.receipt.id}
            item={resolveTarget.item}
            itemIdx={resolveTarget.itemIdx}
            onClose={() => setResolveTarget(null)}
            onResolved={handleResolved}
          />
        )}
      </AnimatePresence>

      {/* Modal de confirmação */}
      <AnimatePresence>
        {selected && (
          <ReceiptConfirmModal
            receipt={selected}
            onClose={() => setSelected(null)}
            onDone={handleDone}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
