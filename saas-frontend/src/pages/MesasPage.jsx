import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listTables, createTable, deleteTable } from '../api/users';
import { getTenantInfo } from '../api/users';
import QRCode from 'qrcode';

// ── QR Code helper ────────────────────────────────────────────

async function makeQR(url) {
  try {
    return await QRCode.toDataURL(url, {
      width: 300, margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });
  } catch { return null; }
}

// ── Modal: imprimir QR ────────────────────────────────────────

function PrintModal({ table, slug, onClose }) {
  const [qrSrc, setQrSrc] = useState(null);
  const url = `${window.location.origin}/${slug}?mesa=${table.number}`;

  useEffect(() => {
    makeQR(url).then(setQrSrc);
  }, [url]);

  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Mesa ${table.number}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 40px; background: #fff; }
        .box { display: inline-block; border: 3px solid #f97316; border-radius: 24px; padding: 32px 40px; }
        h1 { font-size: 48px; font-weight: 900; color: #1a1a1a; margin: 0 0 4px; }
        p.sub { font-size: 16px; color: #555; margin: 0 0 24px; }
        img { width: 240px; height: 240px; display: block; margin: 0 auto 16px; }
        p.url { font-size: 12px; color: #888; word-break: break-all; max-width: 240px; margin: 0 auto; }
        p.cta { font-size: 18px; font-weight: 700; color: #f97316; margin-top: 16px; }
      </style></head><body>
      <div class="box">
        <h1>${table.name || `Mesa ${table.number}`}</h1>
        <p class="sub">Escaneie e faça seu pedido</p>
        <img src="${qrSrc}" />
        <p class="cta">📱 Aponte a câmera para pedir</p>
        <p class="url">${url}</p>
      </div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-sm bg-gray-900 border border-white/[0.08] rounded-2xl shadow-2xl z-10 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-black text-white">{table.name || `Mesa ${table.number}`}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {qrSrc ? (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <img src={qrSrc} alt="QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-gray-500 text-center break-all px-2">{url}</p>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => navigator.clipboard?.writeText(url)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm font-semibold transition-colors"
              >
                Copiar link
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors"
              >
                🖨️ Imprimir
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function MesasPage() {
  const [tables,   setTables]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [slug,     setSlug]     = useState('');
  const [number,   setNumber]   = useState('');
  const [name,     setName]     = useState('');
  const [adding,   setAdding]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error,    setError]    = useState('');
  const [printTable, setPrintTable] = useState(null);
  const [qrCache,    setQrCache]    = useState({});
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: me }] = await Promise.all([listTables(), getTenantInfo()]);
      if (!mounted.current) return;
      setTables(t.data ?? []);
      setSlug(me.data?.slug ?? '');
    } catch { /* silent */ }
    finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    return () => { mounted.current = false; };
  }, [load]);

  // Pré-gera QR codes ao carregar mesas
  useEffect(() => {
    if (!slug || !tables.length) return;
    tables.forEach(async (t) => {
      if (qrCache[t.id]) return;
      const url = `${window.location.origin}/${slug}?mesa=${t.number}`;
      const src = await makeQR(url);
      if (src) setQrCache(prev => ({ ...prev, [t.id]: src }));
    });
  }, [tables, slug]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!number.trim()) { setError('Número é obrigatório.'); return; }
    setAdding(true); setError('');
    try {
      await createTable({ number: number.trim(), name: name.trim() || null });
      setNumber(''); setName(''); setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao criar mesa.');
    } finally { setAdding(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta mesa?')) return;
    try {
      await deleteTable(id);
      setTables(prev => prev.filter(t => t.id !== id));
    } catch { /* silent */ }
  };

  const menuUrl = slug ? `${window.location.origin}/${slug}` : '';

  return (
    <>
      <AnimatePresence>
        {printTable && (
          <PrintModal table={printTable} slug={slug} onClose={() => setPrintTable(null)} />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-full gap-5 p-5 overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-black text-white">Mesas / QR Code</h1>
            <p className="text-sm text-gray-500 mt-0.5">Cada mesa tem um QR code único. O cliente escaneia e faz o pedido direto do celular.</p>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setError(''); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Nova Mesa
          </button>
        </div>

        {/* Formulário de nova mesa */}
        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleAdd}
              className="overflow-hidden"
            >
              <div className="bg-gray-800/60 border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3">
                <p className="text-sm font-bold text-white">Nova Mesa</p>
                <div className="flex gap-3">
                  <div className="w-32">
                    <label className="text-[11px] text-gray-500 font-semibold mb-1 block">Número *</label>
                    <input
                      type="text" placeholder="1" value={number}
                      onChange={e => setNumber(e.target.value)}
                      className="input w-full" autoFocus
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-gray-500 font-semibold mb-1 block">Nome (opcional)</label>
                    <input
                      type="text" placeholder="Ex: Varanda, Salão VIP..."
                      value={name} onChange={e => setName(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowForm(false); setError(''); }}
                    className="px-4 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm font-semibold transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={adding || !number.trim()}
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-bold transition-colors">
                    {adding ? 'Criando...' : 'Criar Mesa'}
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Dica se sem mesas */}
        {!loading && tables.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-gray-600 py-16">
            <span className="text-5xl">🪑</span>
            <p className="text-base font-semibold">Nenhuma mesa cadastrada</p>
            <p className="text-sm text-center max-w-xs">Crie as mesas do seu restaurante. Cada uma gera um QR code que o cliente escaneia para fazer o pedido direto do celular.</p>
            <button onClick={() => setShowForm(true)}
              className="mt-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors">
              Criar primeira mesa
            </button>
          </div>
        )}

        {/* Grid de mesas */}
        {loading ? (
          <div className="flex items-center justify-center flex-1 gap-2 text-gray-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Carregando mesas...</span>
          </div>
        ) : tables.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {tables.map((table) => (
              <motion.div
                key={table.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gray-800/60 border border-white/[0.07] rounded-2xl p-4 flex flex-col items-center gap-3 hover:border-orange-500/30 transition-colors"
              >
                {/* Mini QR */}
                <div
                  className="w-20 h-20 bg-white rounded-xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform shadow-lg"
                  onClick={() => setPrintTable(table)}
                  title="Ver / imprimir QR code"
                >
                  {qrCache[table.id]
                    ? <img src={qrCache[table.id]} alt="QR" className="w-16 h-16" />
                    : <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  }
                </div>

                {/* Info */}
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-black text-white leading-tight truncate">
                    {table.name || `Mesa ${table.number}`}
                  </p>
                  {table.name && (
                    <p className="text-xs text-gray-500">nº {table.number}</p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex gap-1.5 w-full">
                  <button
                    onClick={() => setPrintTable(table)}
                    className="flex-1 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-xs font-bold transition-colors"
                  >
                    🖨️ QR
                  </button>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/${slug}?mesa=${table.number}`;
                      navigator.clipboard?.writeText(url);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-xs font-bold transition-colors"
                    title="Copiar link"
                  >
                    🔗 Link
                  </button>
                  <button
                    onClick={() => handleDelete(table.id)}
                    className="py-1.5 px-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
                    title="Remover mesa"
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Dica de uso */}
        {tables.length > 0 && slug && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 shrink-0">
            <p className="text-sm font-bold text-blue-300 mb-1">Como funciona</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Imprima o QR code de cada mesa e coloque sobre ela (plastificado ou num porta-cardápio). O cliente escaneia, o cardápio abre mostrando <strong className="text-white">Mesa X</strong>, e o pedido chega direto no Kanban e KDS com o número da mesa.
            </p>
            {menuUrl && (
              <p className="text-xs text-blue-400 mt-2 break-all">
                Exemplo: <span className="font-mono">{menuUrl}?mesa=1</span>
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
