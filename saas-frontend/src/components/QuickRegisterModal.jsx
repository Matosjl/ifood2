/**
 * QuickRegisterModal v2 — cadastro de produto em < 20 segundos
 *
 * Fluxo:
 *  1. form    → nome (sugestões smart) + preço (chips) + categoria (auto-detect) + foto
 *  2. saved   → sucesso + oferta de ficha técnica IA
 *  3. ficha   → IA gera ingredientes → usuário ajusta → salva
 *  fichaDone  → confirmação
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createProduct, listCategories } from '../api/products';
import api from '../api/axios';

// ── Smart suggestions (common Brazilian restaurant items) ─────
const SUGGESTIONS = [
  // Marmitas / pratos
  { name: 'Marmita Frango', cat: 'Marmitas', price: 18 },
  { name: 'Marmita Bife',   cat: 'Marmitas', price: 22 },
  { name: 'Marmita Peixe',  cat: 'Marmitas', price: 20 },
  { name: 'Marmita Vegana', cat: 'Marmitas', price: 17 },
  // Lanches
  { name: 'X-Burguer',      cat: 'Lanches',  price: 20 },
  { name: 'X-Bacon',        cat: 'Lanches',  price: 25 },
  { name: 'X-Salada',       cat: 'Lanches',  price: 18 },
  { name: 'Hot Dog Simples', cat: 'Lanches', price: 12 },
  { name: 'Batata Frita',   cat: 'Acompanhamentos', price: 12 },
  // Pizzas
  { name: 'Pizza Mussarela',    cat: 'Pizzas', price: 45 },
  { name: 'Pizza Calabresa',    cat: 'Pizzas', price: 48 },
  { name: 'Pizza Frango c/ Catupiry', cat: 'Pizzas', price: 52 },
  // Bebidas
  { name: 'Suco Natural 500ml', cat: 'Bebidas', price: 8 },
  { name: 'Água Mineral',       cat: 'Bebidas', price: 3 },
  { name: 'Refrigerante Lata',  cat: 'Bebidas', price: 5 },
  { name: 'Açaí 300ml',         cat: 'Açaí',   price: 16 },
  { name: 'Açaí 500ml',         cat: 'Açaí',   price: 22 },
  // Sobremesas
  { name: 'Brownie',            cat: 'Sobremesas', price: 10 },
  { name: 'Pudim',              cat: 'Sobremesas', price: 8 },
  // Outros
  { name: 'Prato Feito',        cat: 'Pratos',  price: 16 },
  { name: 'Frango Grelhado',    cat: 'Pratos',  price: 22 },
  { name: 'Filé de Frango',     cat: 'Pratos',  price: 25 },
];

// Auto-detect category from product name
function detectCategory(name, categories) {
  const n = name.toLowerCase();
  const patterns = [
    [/marmita|quentinha/,        'Marmitas'],
    [/pizza|calzone/,            'Pizzas'],
    [/burger|x-|smash|hotdog|hot dog|cachorro/,'Lanches'],
    [/batata|fritas/,            'Acompanhamentos'],
    [/suco|vitamina|smoothie/,   'Bebidas'],
    [/refrigerante|coca|guaraná|água/,'Bebidas'],
    [/açaí|acai/,                'Açaí'],
    [/cerveja|chopp/,            'Bebidas'],
    [/sorvete|brownie|torta|pudim|bolo/,'Sobremesas'],
    [/frango|bife|peixe|tilápia|salmão|carne/,'Pratos'],
    [/arroz|feijão|farofa/,      'Acompanhamentos'],
  ];
  for (const [re, catName] of patterns) {
    if (re.test(n)) {
      const found = categories.find((c) => c.name.toLowerCase().includes(catName.toLowerCase()));
      if (found) return found.id;
    }
  }
  return '';
}

// Quick price chips
const PRICE_CHIPS = [10, 15, 18, 20, 25, 30, 35, 40, 50];

// Extract JSON from AI response text
function extractJson(text) {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch {
    // Try to find JSON block in text
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return null; }
    }
    return null;
  }
}

const UNITS = ['g', 'kg', 'ml', 'l', 'un', 'cx', 'pct'];

export default function QuickRegisterModal({ onClose, onSaved, onComplete }) {
  const [categories, setCategories] = useState([]);

  // Step: 'form' | 'saved' | 'ficha' | 'fichaDone'
  const [step, setStep] = useState('form');

  // Form state
  const [name,       setName]       = useState('');
  const [price,      setPrice]      = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [imageFile,  setImageFile]  = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [done,       setDone]       = useState(null); // { id, name }

  // Suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);

  // Ficha técnica state
  const [fichaLoading,  setFichaLoading]  = useState(false);
  const [fichaError,    setFichaError]    = useState(null);
  const [fichaItems,    setFichaItems]    = useState([]); // [{ name, qty_per_unit, unit }]
  const [fichaSaving,   setFichaSaving]   = useState(false);

  const nameRef  = useRef(null);
  const fileRef  = useRef(null);
  const priceRef = useRef(null);

  useEffect(() => {
    listCategories().then(({ data }) => setCategories(data.data ?? [])).catch(() => {});
    setTimeout(() => nameRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Filter suggestions as user types
  useEffect(() => {
    const q = name.trim().toLowerCase();
    if (!q) {
      setFilteredSuggestions(SUGGESTIONS.slice(0, 6));
    } else {
      const filtered = SUGGESTIONS.filter((s) =>
        s.name.toLowerCase().includes(q)
      ).slice(0, 5);
      setFilteredSuggestions(filtered);
    }
  }, [name]);

  const applySuggestion = (s) => {
    setName(s.name);
    if (s.price && !price) setPrice(String(s.price));
    const autoId = detectCategory(s.name, categories);
    if (autoId) setCategoryId(autoId);
    setShowSuggestions(false);
    setTimeout(() => priceRef.current?.focus(), 80);
  };

  const handleNameChange = (v) => {
    setName(v);
    const autoId = detectCategory(v, categories);
    if (autoId) setCategoryId(autoId);
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  // ── Submit product ────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Nome é obrigatório.');
    const p = parseFloat(price);
    if (!p || p <= 0) return setError('Informe um preço válido.');
    setError(null);
    setSaving(true);

    try {
      const fd = new FormData();
      fd.append('name',       name.trim());
      fd.append('sale_price', p);
      fd.append('sale_type',  'unit');
      fd.append('active',     'true');
      fd.append('featured',   'false');
      if (categoryId) fd.append('category_id', categoryId);
      if (imageFile)  fd.append('image', imageFile);

      const { data } = await createProduct(fd);
      const created = data.data ?? data;
      setDone({ id: created.id, name: created.name });
      onSaved?.(created);
      setStep('saved');
    } catch (err) {
      setError(err?.response?.data?.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── AI ficha técnica ──────────────────────────────────────────
  const generateFicha = useCallback(async () => {
    if (!done?.name) return;
    setFichaLoading(true);
    setFichaError(null);
    setStep('ficha');

    try {
      const prompt = `Crie uma ficha técnica para o produto de restaurante: "${done.name}".
Retorne SOMENTE este JSON, sem texto adicional, sem markdown:
{"ingredients":[{"name":"arroz","qty_per_unit":0.15,"unit":"kg"},{"name":"feijão","qty_per_unit":0.1,"unit":"kg"}]}
Unidades válidas: g, kg, ml, l, un, cx, pct
Liste de 3 a 7 ingredientes principais. Quantidades por porção individual.`;

      const { data } = await api.post('/ai/center/chat', { message: prompt });
      const raw = data.data?.response ?? data.data ?? '';
      const parsed = extractJson(raw);

      if (parsed?.ingredients?.length > 0) {
        setFichaItems(parsed.ingredients.map((i) => ({
          name:          String(i.name ?? ''),
          qty_per_unit:  parseFloat(i.qty_per_unit ?? 1) || 1,
          unit:          UNITS.includes(i.unit) ? i.unit : 'un',
        })));
      } else {
        // Fallback: generic ingredients
        setFichaItems([
          { name: 'Ingrediente principal', qty_per_unit: 0.2, unit: 'kg' },
          { name: 'Tempero',               qty_per_unit: 5,   unit: 'g'  },
        ]);
        setFichaError('IA retornou resposta inesperada. Ajuste manualmente.');
      }
    } catch {
      setFichaItems([
        { name: 'Ingrediente principal', qty_per_unit: 0.2, unit: 'kg' },
      ]);
      setFichaError('IA indisponível. Preencha manualmente.');
    } finally {
      setFichaLoading(false);
    }
  }, [done?.name]);

  const updateFichaItem = (idx, field, value) => {
    setFichaItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };
  const removeFichaItem = (idx) => setFichaItems((prev) => prev.filter((_, i) => i !== idx));
  const addFichaItem = () => setFichaItems((prev) => [...prev, { name: '', qty_per_unit: 1, unit: 'un' }]);

  // ── Save ficha ────────────────────────────────────────────────
  const saveFicha = async () => {
    if (!done?.id) return;
    const valid = fichaItems.filter((i) => i.name.trim() && i.qty_per_unit > 0);
    if (valid.length === 0) return setFichaError('Adicione pelo menos 1 ingrediente.');

    setFichaSaving(true);
    setFichaError(null);

    try {
      // Get or create insumos
      const { data: existingData } = await api.get('/insumos?limit=200');
      const existing = existingData.data ?? [];

      const insumoLinks = [];
      for (const item of valid) {
        let insumo = existing.find((ins) =>
          ins.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );
        if (!insumo) {
          // Create new insumo
          const { data: created } = await api.post('/insumos', {
            name:          item.name.trim(),
            unit:          item.unit,
            qty_in_stock:  0,
            min_qty:       0,
            cost_per_unit: 0,
          });
          insumo = created.data ?? created;
        }
        if (insumo?.id) {
          insumoLinks.push({ insumo_id: insumo.id, qty_per_unit: item.qty_per_unit });
        }
      }

      await api.put(`/insumos/product/${done.id}`, { insumos: insumoLinks });
      setStep('fichaDone');
    } catch (err) {
      setFichaError(err?.response?.data?.message || 'Erro ao salvar ficha. Tente novamente.');
    } finally {
      setFichaSaving(false);
    }
  };

  const resetForNext = () => {
    setStep('form');
    setName(''); setPrice(''); setCategoryId('');
    setImageFile(null); setPreview(null);
    setDone(null); setFichaItems([]);
    setFichaError(null); setError(null);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const fmtBRL = (n) => `R$ ${parseFloat(n).toFixed(2).replace('.', ',')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-sm bg-gray-900 rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div>
            <p className="text-base font-black text-white">⚡ Cadastro Rápido</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'form'      && 'Produto no ar em 20 segundos'}
              {step === 'saved'     && `"${done?.name}" cadastrado ✅`}
              {step === 'ficha'     && 'Ficha técnica assistida por IA'}
              {step === 'fichaDone' && 'Ficha técnica salva ✅'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── STEP: FORM ── */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">

            {/* Photo + Name */}
            <div className="flex gap-3 items-start">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="shrink-0 w-20 h-20 rounded-xl bg-gray-800 border-2 border-dashed border-white/20 hover:border-white/40 transition-colors flex flex-col items-center justify-center overflow-hidden">
                {preview
                  ? <img src={preview} alt="preview" className="w-full h-full object-cover" />
                  : <><p className="text-2xl">📷</p><p className="text-[10px] text-gray-500 mt-0.5">Foto</p></>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

              <div className="flex-1 relative">
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Nome *</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Ex: Marmita Frango"
                  className="input w-full text-sm"
                  required
                  maxLength={80}
                  autoComplete="off"
                />
                {/* Suggestions dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden max-h-48 overflow-y-auto">
                    {filteredSuggestions.map((s) => (
                      <button key={s.name} type="button" onMouseDown={() => applySuggestion(s)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors text-left">
                        <span className="text-sm font-semibold text-white">{s.name}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[10px] text-gray-500">{s.cat}</span>
                          <span className="text-xs font-bold text-orange-400">{fmtBRL(s.price)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Price + chips */}
            <div>
              <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Preço *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">R$</span>
                <input
                  ref={priceRef}
                  type="number" min="0.01" step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  className="input w-full text-sm pl-10 text-lg font-black"
                  required
                />
              </div>
              {/* Price chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PRICE_CHIPS.map((p) => (
                  <button key={p} type="button" onClick={() => setPrice(String(p))}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                      parseFloat(price) === p
                        ? 'bg-orange-500 border-orange-400 text-white'
                        : 'bg-gray-800 border-white/10 text-gray-400 hover:border-white/30'
                    }`}>
                    R$ {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                Categoria <span className="text-gray-600 font-normal normal-case">(auto-detectada)</span>
              </label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input w-full text-sm">
                <option value="">— Sem categoria —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2 border border-red-500/20">{error}</p>
            )}

            <button type="submit" disabled={saving || !name.trim() || !price}
              className="btn-green w-full font-black text-base py-3.5 disabled:opacity-50">
              {saving
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando…</span>
                : '✅ Salvar e vender agora'}
            </button>

            <button type="button" onClick={() => { onComplete?.(); onClose(); }}
              className="w-full text-xs text-gray-600 hover:text-gray-400 py-1 text-center">
              Preencher todos os campos →
            </button>
          </form>
        )}

        {/* ── STEP: SAVED ── */}
        {step === 'saved' && (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="text-5xl">🎉</div>
              <p className="text-lg font-black text-white">"{done?.name}"</p>
              <p className="text-sm text-green-400 font-semibold">já está no cardápio digital!</p>
            </div>

            {/* Ficha técnica CTA */}
            <div className="bg-gradient-to-br from-purple-500/15 to-blue-500/10 border border-purple-500/20 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🤖</span>
                <div className="flex-1">
                  <p className="text-sm font-black text-white">Gerar ficha técnica com IA?</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    A IA sugere os ingredientes baseado no nome do produto. Você ajusta e confirma.
                  </p>
                </div>
              </div>
              <button onClick={generateFicha}
                className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl transition-colors text-sm active:scale-95">
                ✨ Sim, gerar ficha técnica
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={resetForNext} className="btn-green w-full font-bold">
                ⚡ Cadastrar outro produto
              </button>
              <button onClick={() => { onComplete?.(done?.id); onClose(); }}
                className="btn-ghost w-full text-sm">
                ✏️ Completar cadastro (descrição, estoque, variações...)
              </button>
              <button onClick={onClose} className="text-xs text-gray-600 hover:text-gray-400 py-1 text-center">
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: FICHA ── */}
        {step === 'ficha' && (
          <div className="p-5 space-y-4 overflow-y-auto">
            {fichaLoading ? (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-semibold text-white">IA analisando "{done?.name}"...</p>
                <p className="text-xs text-gray-500">Gerando ingredientes automaticamente</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-white">Ingredientes sugeridos</p>
                  <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                    🤖 IA gerou
                  </span>
                </div>

                {fichaError && (
                  <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                    ⚠️ {fichaError}
                  </p>
                )}

                <div className="space-y-2">
                  {fichaItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2.5">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateFichaItem(idx, 'name', e.target.value)}
                        placeholder="Nome do insumo"
                        className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
                      />
                      <input
                        type="number" min="0.001" step="0.001"
                        value={item.qty_per_unit}
                        onChange={(e) => updateFichaItem(idx, 'qty_per_unit', parseFloat(e.target.value) || 0)}
                        className="w-16 bg-gray-700 text-sm text-white text-right rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <select
                        value={item.unit}
                        onChange={(e) => updateFichaItem(idx, 'unit', e.target.value)}
                        className="bg-gray-700 text-sm text-gray-300 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <button type="button" onClick={() => removeFichaItem(idx)}
                        className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none">
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={addFichaItem}
                  className="w-full border border-dashed border-white/20 hover:border-white/40 text-gray-500 hover:text-gray-300 py-2 rounded-xl text-sm transition-colors">
                  + Adicionar ingrediente
                </button>

                <button onClick={saveFicha} disabled={fichaSaving}
                  className="btn-green w-full font-bold py-3 disabled:opacity-50">
                  {fichaSaving
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Salvando ficha...</span>
                    : '💾 Salvar ficha técnica'}
                </button>

                <button onClick={() => setStep('saved')} className="w-full text-xs text-gray-600 hover:text-gray-400 py-1 text-center">
                  ← Voltar
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STEP: FICHA DONE ── */}
        {step === 'fichaDone' && (
          <div className="p-6 text-center space-y-4">
            <div className="text-5xl">⚙️</div>
            <div>
              <p className="text-lg font-black text-white">Ficha técnica salva!</p>
              <p className="text-sm text-gray-400 mt-1">
                O CMV de "{done?.name}" será calculado automaticamente a partir de agora.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={resetForNext} className="btn-green w-full font-bold">
                ⚡ Cadastrar outro produto
              </button>
              <button onClick={() => { onComplete?.(done?.id); onClose(); }}
                className="btn-ghost w-full text-sm">
                ✏️ Completar cadastro
              </button>
              <button onClick={onClose} className="text-xs text-gray-600 hover:text-gray-400 py-1 text-center">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
