import { useState, useEffect, useCallback } from 'react';
import { getOverhead, saveOverhead, calculate, listHistory } from '../api/precificador';
import { listProducts } from '../api/products';

const fmt  = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2).replace('.', ',')}`;
const pct  = (n) => `${parseFloat(n ?? 0).toFixed(1)}%`;

// ─────────────────────────────────────────────────────────────
// Overhead Settings Panel
// ─────────────────────────────────────────────────────────────
function OverheadPanel({ overhead, onChange, onSave, saving }) {
  const fields = [
    { key: 'embalagem',      label: 'Embalagem (R$/un)',     type: 'fixed' },
    { key: 'gas',            label: 'Gás (R$/un)',           type: 'fixed' },
    { key: 'energia',        label: 'Energia (R$/un)',       type: 'fixed' },
    { key: 'mao_obra',       label: 'Mão de obra (R$/un)',   type: 'fixed' },
    { key: 'taxa_app',       label: 'Taxa do App (%)',       type: 'pct' },
    { key: 'taxa_pagamento', label: 'Taxa de pagamento (%)', type: 'pct' },
    { key: 'margem_minima',  label: 'Margem mínima (%)',     type: 'pct' },
    { key: 'margem_desejada',label: 'Margem desejada (%)',   type: 'pct' },
  ];

  return (
    <div className="bg-gray-800/60 rounded-2xl border border-white/[0.06] p-5">
      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <span>⚙️</span> Configurar Overhead Padrão
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fields.map(({ key, label, type }) => (
          <div key={key}>
            <label className="block text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">
              {label}
            </label>
            <div className="relative">
              {type === 'fixed' && (
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R$</span>
              )}
              <input
                type="number"
                min="0"
                step={type === 'pct' ? '0.5' : '0.01'}
                value={overhead[key] ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                className={`input w-full text-sm ${type === 'fixed' ? 'pl-8' : ''}`}
              />
              {type === 'pct' && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onSave}
        disabled={saving}
        className="btn-blue mt-4 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : '💾 Salvar configurações'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Result Card
// ─────────────────────────────────────────────────────────────
function ResultCard({ result }) {
  if (!result) return null;

  const { margem_real } = result;
  const margemColor =
    margem_real === null ? 'text-gray-400'
    : margem_real >= parseFloat(result.margem_desejada ?? 40) ? 'text-green-400'
    : margem_real >= parseFloat(result.margem_minima ?? 30)  ? 'text-yellow-400'
    : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Main prices */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/60 rounded-2xl border border-white/[0.06] p-4 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Preço Mínimo</p>
          <p className="text-2xl font-black text-yellow-300 tabular-nums">{fmt(result.preco_minimo)}</p>
          <p className="text-[11px] text-gray-500 mt-1">margem {pct(result.margem_minima)}</p>
        </div>
        <div className="bg-indigo-900/30 rounded-2xl border border-indigo-500/30 p-4 text-center ring-1 ring-indigo-500/20">
          <p className="text-[10px] text-indigo-300 uppercase tracking-wide font-semibold mb-1">Preço Ideal</p>
          <p className="text-2xl font-black text-indigo-200 tabular-nums">{fmt(result.preco_ideal)}</p>
          <p className="text-[11px] text-indigo-400/60 mt-1">margem {pct(result.margem_desejada)}</p>
        </div>
        <div className="bg-green-900/30 rounded-2xl border border-green-500/30 p-4 text-center">
          <p className="text-[10px] text-green-300 uppercase tracking-wide font-semibold mb-1">✨ Preço Sugerido</p>
          <p className="text-3xl font-black text-green-200 tabular-nums">{fmt(result.preco_sugerido)}</p>
          <p className="text-[11px] text-green-400/60 mt-1">preço psicológico</p>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="bg-gray-800/60 rounded-2xl border border-white/[0.06] p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Composição do Custo</p>
        <div className="space-y-2">
          <CostRow label="🧂 Ingredientes"  value={result.custo_insumos}  />
          <CostRow label="📦 Embalagem"     value={result.overhead_usado?.embalagem}     />
          <CostRow label="🔥 Gás"           value={result.overhead_usado?.gas}           />
          <CostRow label="⚡ Energia"        value={result.overhead_usado?.energia}       />
          <CostRow label="👩‍🍳 Mão de obra"   value={result.overhead_usado?.mao_obra}      />
          <div className="border-t border-white/[0.06] pt-2 mt-2">
            <CostRow label="📱 Taxa App (%)"        value={(result.preco_sugerido * (result.overhead_usado?.taxa_app ?? 0)) / 100} extra={pct(result.overhead_usado?.taxa_app)} />
            <CostRow label="💳 Taxa Pagamento (%)"  value={(result.preco_sugerido * (result.overhead_usado?.taxa_pagamento ?? 0)) / 100} extra={pct(result.overhead_usado?.taxa_pagamento)} />
          </div>
          <div className="border-t border-white/[0.08] pt-2 mt-2 flex justify-between items-center">
            <span className="text-sm font-bold text-white">Total custo</span>
            <span className="text-sm font-black text-red-400 tabular-nums">{fmt(result.custo_total)}</span>
          </div>
        </div>
      </div>

      {/* Margin on current price */}
      {margem_real !== null && (
        <div className={`rounded-2xl border p-4 ${
          margem_real >= (result.margem_desejada ?? 40)
            ? 'bg-green-900/20 border-green-500/30'
            : margem_real >= (result.margem_minima ?? 30)
              ? 'bg-yellow-900/20 border-yellow-500/30'
              : 'bg-red-900/20 border-red-500/30'
        }`}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Margem no preço atual</p>
          <p className={`text-3xl font-black tabular-nums ${margemColor}`}>{pct(margem_real)}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {margem_real >= (result.margem_desejada ?? 40) ? '✅ Acima da margem desejada'
              : margem_real >= (result.margem_minima ?? 30) ? '⚠️ Entre mínima e desejada'
              : '❌ Abaixo da margem mínima'}
          </p>
        </div>
      )}

      {/* Ingredients breakdown */}
      {result.ingredientes?.length > 0 && (
        <div className="bg-gray-800/60 rounded-2xl border border-white/[0.06] p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Ficha Técnica</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-white/[0.06]">
                <th className="text-left pb-2 font-semibold">Ingrediente</th>
                <th className="text-right pb-2 font-semibold">Qtd</th>
                <th className="text-right pb-2 font-semibold">+Perda</th>
                <th className="text-right pb-2 font-semibold">Custo/un</th>
                <th className="text-right pb-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.ingredientes.map((ing, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-1.5 text-gray-200">{ing.nome}</td>
                  <td className="py-1.5 text-right text-gray-400 tabular-nums">{ing.qty} {ing.unidade}</td>
                  <td className="py-1.5 text-right text-gray-400 tabular-nums">{ing.qty_c_perda} {ing.unidade}</td>
                  <td className="py-1.5 text-right text-gray-400 tabular-nums">{fmt(ing.custo_unit)}</td>
                  <td className="py-1.5 text-right font-semibold text-white tabular-nums">{fmt(ing.custo_linha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CostRow({ label, value, extra }) {
  if (!value && value !== 0) return null;
  const v = parseFloat(value ?? 0);
  if (v === 0) return null;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-400">{label}{extra ? ` — ${extra}` : ''}</span>
      <span className="text-white tabular-nums font-semibold">{fmt(v)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// History Table
// ─────────────────────────────────────────────────────────────
function HistoryTable({ rows }) {
  if (!rows.length) return (
    <p className="text-sm text-gray-500 text-center py-8 italic">Nenhum cálculo salvo ainda.</p>
  );

  const fmtDate = (s) => {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="overflow-auto rounded-xl border border-white/[0.06]">
      <table className="w-full text-xs">
        <thead className="bg-gray-900/60">
          <tr className="text-gray-500 border-b border-white/[0.06]">
            <th className="text-left px-3 py-2.5 font-semibold">Produto</th>
            <th className="text-right px-3 py-2.5 font-semibold">Custo</th>
            <th className="text-right px-3 py-2.5 font-semibold">Preço sugerido</th>
            <th className="text-right px-3 py-2.5 font-semibold">Margem real</th>
            <th className="text-right px-3 py-2.5 font-semibold">Data</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
              <td className="px-3 py-2 text-gray-200">{r.product_name}</td>
              <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{fmt(r.custo_total)}</td>
              <td className="px-3 py-2 text-right font-semibold text-green-300 tabular-nums">{fmt(r.preco_sugerido)}</td>
              <td className={`px-3 py-2 text-right font-bold tabular-nums ${
                r.margem_real === null ? 'text-gray-500'
                : parseFloat(r.margem_real) >= 30 ? 'text-green-400' : 'text-red-400'
              }`}>
                {r.margem_real !== null ? pct(r.margem_real) : '—'}
              </td>
              <td className="px-3 py-2 text-right text-gray-500">{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function PrecificadorTab() {
  const [products,  setProducts]  = useState([]);
  const [overhead,  setOverhead]  = useState({
    embalagem: '', gas: '', energia: '', taxa_app: '', taxa_pagamento: '',
    mao_obra: '', margem_minima: 30, margem_desejada: 40,
  });
  const [history,   setHistory]   = useState([]);
  const [result,    setResult]    = useState(null);
  const [activeView, setActiveView] = useState('calc'); // 'calc' | 'config' | 'history'

  // Form
  const [mode,         setMode]         = useState('product'); // 'product' | 'manual'
  const [productId,    setProductId]    = useState('');
  const [custoManual,  setCustoManual]  = useState('');
  const [prodName,     setProdName]     = useState('');
  const [margemDes,    setMargemDes]    = useState('');
  const [margemMin,    setMargemMin]    = useState('');
  const [precoAtual,   setPrecoAtual]   = useState('');
  const [salvar,       setSalvar]       = useState(true);

  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  // Load initial data
  useEffect(() => {
    // Carrega cada parte independentemente — falha em overhead/history não impede os produtos
    listProducts({ active: true, limit: 200 })
      .then((r) => setProducts(r.data.data ?? []))
      .catch(() => {});

    getOverhead()
      .then((r) => {
        const oh = r.data.data ?? {};
        setOverhead({
          embalagem:       oh.embalagem       ?? 0,
          gas:             oh.gas             ?? 0,
          energia:         oh.energia         ?? 0,
          taxa_app:        oh.taxa_app        ?? 0,
          taxa_pagamento:  oh.taxa_pagamento  ?? 0,
          mao_obra:        oh.mao_obra        ?? 0,
          margem_minima:   oh.margem_minima   ?? 30,
          margem_desejada: oh.margem_desejada ?? 40,
        });
      })
      .catch(() => {});

    listHistory(50)
      .then((r) => setHistory(r.data.data ?? []))
      .catch(() => {});
  }, []);

  const handleOverheadChange = useCallback((key, val) => {
    setOverhead((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSaveOverhead = async () => {
    setSaving(true);
    try {
      await saveOverhead(overhead);
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const payload = {
      overhead,
      margem_desejada: margemDes  ? parseFloat(margemDes)  : undefined,
      margem_minima:   margemMin  ? parseFloat(margemMin)   : undefined,
      preco_venda_atual: precoAtual ? parseFloat(precoAtual) : undefined,
      salvar,
    };

    if (mode === 'product' && productId) {
      payload.product_id = productId;
    } else {
      const c = parseFloat(custoManual);
      if (!c || c <= 0) {
        setError('Informe o custo dos ingredientes.');
        setLoading(false);
        return;
      }
      payload.custo_insumos = c;
      payload.product_name  = prodName.trim() || 'Produto sem nome';
    }

    try {
      const { data } = await calculate(payload);
      setResult(data.data);
      if (salvar) {
        // Refresh history
        listHistory(50).then(({ data: h }) => setHistory(h.data ?? [])).catch(() => {});
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Erro ao calcular. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* Sub-tabs */}
      <div className="flex gap-1">
        {[
          ['calc',    '🧮 Calcular'],
          ['config',  '⚙️ Configurar'],
          ['history', '📜 Histórico'],
        ].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
              activeView === v ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CONFIGURAR ── */}
      {activeView === 'config' && (
        <OverheadPanel
          overhead={overhead}
          onChange={handleOverheadChange}
          onSave={handleSaveOverhead}
          saving={saving}
        />
      )}

      {/* ── HISTÓRICO ── */}
      {activeView === 'history' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">Últimos 50 cálculos salvos</p>
          <HistoryTable rows={history} />
        </div>
      )}

      {/* ── CALCULAR ── */}
      {activeView === 'calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Left: form */}
          <form onSubmit={handleCalculate} className="space-y-4">

            {/* Mode toggle */}
            <div className="flex gap-1 bg-gray-900/60 rounded-xl p-1 border border-white/[0.06]">
              {[
                ['product', '📦 Por produto'],
                ['manual',  '✏️ Manual'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setMode(v); setResult(null); setError(null); }}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    mode === v ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Product selector */}
            {mode === 'product' ? (
              <div>
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                  Produto
                </label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="input w-full text-sm"
                  required
                >
                  <option value="">— Selecione um produto —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {selectedProduct?.sale_price && (
                  <p className="text-xs text-gray-500 mt-1">
                    Preço atual: <span className="text-white font-semibold">{fmt(selectedProduct.sale_price)}</span>
                    {!precoAtual && ' — cole abaixo para ver a margem real'}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                    Nome do produto
                  </label>
                  <input
                    type="text"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="Ex: X-Burguer Especial"
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                    Custo dos ingredientes (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={custoManual}
                      onChange={(e) => setCustoManual(e.target.value)}
                      placeholder="0,00"
                      className="input w-full text-sm pl-8"
                      required={mode === 'manual'}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Optional overrides */}
            <div className="bg-gray-800/40 rounded-xl border border-white/[0.05] p-3 space-y-3">
              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                Parâmetros opcionais (sobrescreve configurações padrão)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Margem desejada (%)</label>
                  <input
                    type="number" min="0" max="99" step="0.5"
                    value={margemDes}
                    onChange={(e) => setMargemDes(e.target.value)}
                    placeholder={`padrão: ${overhead.margem_desejada ?? 40}%`}
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Margem mínima (%)</label>
                  <input
                    type="number" min="0" max="99" step="0.5"
                    value={margemMin}
                    onChange={(e) => setMargemMin(e.target.value)}
                    placeholder={`padrão: ${overhead.margem_minima ?? 30}%`}
                    className="input w-full text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Preço de venda atual (R$) — para ver a margem real</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={precoAtual}
                    onChange={(e) => setPrecoAtual(e.target.value)}
                    placeholder={selectedProduct?.sale_price ? String(parseFloat(selectedProduct.sale_price).toFixed(2)) : '0,00'}
                    className="input w-full text-sm pl-8"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={salvar}
                onChange={(e) => setSalvar(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-500"
              />
              Salvar no histórico
            </label>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2 border border-red-500/20">
                ❌ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-green w-full disabled:opacity-50 font-bold text-base py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calculando…
                </span>
              ) : (
                '🧮 Calcular Preço'
              )}
            </button>
          </form>

          {/* Right: result */}
          <div>
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-gray-600 bg-gray-800/20 rounded-2xl border border-white/[0.04]">
                <span className="text-5xl">🏷️</span>
                <p className="text-sm italic text-center px-4">
                  Preencha os dados e calcule para ver o preço ideal, margem e composição de custo.
                </p>
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {result && !loading && <ResultCard result={result} />}
          </div>

        </div>
      )}
    </div>
  );
}
