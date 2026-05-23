import { useState, useEffect, useCallback } from 'react';
import { managerAnalyze, generateMarketing, getWhatsAppMenu, clearWhatsAppMenu } from '../api/ai';
import OcrInvoiceModal from '../components/OcrInvoiceModal';
import api from '../api/axios';

const PERIODS = [
  { value: 'day',   label: 'Hoje' },
  { value: 'week',  label: '7 dias' },
  { value: 'month', label: '30 dias' },
];

const MARKETING_TYPES = [
  { value: 'whatsapp',   emoji: '💬', label: 'WhatsApp' },
  { value: 'instagram',  emoji: '📸', label: 'Instagram' },
  { value: 'promotion',  emoji: '🎁', label: 'Promoção' },
  { value: 'campaign',   emoji: '📣', label: 'Campanha' },
];

function SectionHeader({ emoji, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-xl shrink-0">{emoji}</div>
      <div>
        <h2 className="font-black text-white text-base">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-gray-900 rounded-2xl border border-white/[0.07] p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Cardápio do Dia ────────────────────────────────────────────────
function DayMenuSection() {
  const [menu,     setMenu]     = useState(undefined); // undefined = loading, null = none
  const [loading,  setLoading]  = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getWhatsAppMenu();
      setMenu(data.data ?? null);
    } catch {
      setMenu(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClear = async () => {
    if (!window.confirm('Remover o cardápio ativo do WhatsApp?')) return;
    setClearing(true);
    try {
      await clearWhatsAppMenu();
      setMenu(null);
    } catch { /* ignore */ }
    finally { setClearing(false); }
  };

  return (
    <Card>
      <SectionHeader emoji="📋" title="Cardápio do Dia (WhatsApp)" subtitle="Imagem enviada pelo dono via WhatsApp para os clientes" />

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !menu ? (
        <div className="text-center py-10 text-gray-600">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm">Nenhum cardápio ativo no momento.</p>
          <p className="text-xs mt-1 text-gray-700">Envie uma foto via WhatsApp para ativá-lo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Imagem */}
          {menu.image && (
            <div className="rounded-xl overflow-hidden border border-white/[0.07] bg-gray-800">
              <img
                src={`data:image/jpeg;base64,${menu.image}`}
                alt="Cardápio do dia"
                className="w-full object-contain max-h-[480px]"
              />
            </div>
          )}

          {/* Legenda */}
          {menu.caption && (
            <div className="bg-gray-800/60 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">Legenda</p>
              <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{menu.caption}</p>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center justify-between">
            {menu.savedAt && (
              <p className="text-xs text-gray-600">
                Atualizado em {new Date(menu.savedAt).toLocaleString('pt-BR')}
              </p>
            )}
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors disabled:opacity-40 ml-auto"
            >
              {clearing
                ? <><div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> Removendo...</>
                : <><span>🗑️</span> Limpar cardápio</>
              }
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Agente Gerente ─────────────────────────────────────────────────
function ManagerSection() {
  const [period,   setPeriod]   = useState('week');
  const [report,   setReport]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const { data } = await managerAnalyze(period);
      setReport(data.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao analisar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionHeader emoji="📊" title="Análise Gerencial" subtitle="Resumo executivo gerado por IA com base nos seus dados" />

      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                period === p.value ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm transition-colors disabled:opacity-50 ml-auto"
        >
          {loading ? (
            <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analisando...</>
          ) : (
            <><span>✨</span> Analisar</>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Resumo executivo */}
          {report.resumo && (
            <div className="bg-gray-800/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-2">Resumo</p>
              <p className="text-sm text-gray-200 leading-relaxed">{report.resumo}</p>
            </div>
          )}

          {/* Métricas */}
          {report.metricas && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(report.metricas).map(([key, val]) => (
                <div key={key} className="bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{key}</p>
                  <p className="text-lg font-black text-white mt-0.5">{val}</p>
                </div>
              ))}
            </div>
          )}

          {/* Destaques */}
          {report.destaques?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-2">⭐ Destaques</p>
              <ul className="space-y-1.5">
                {report.destaques.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-green-400 mt-0.5 shrink-0">▸</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Alertas */}
          {report.alertas?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-2">⚠️ Alertas</p>
              <div className="space-y-2">
                {report.alertas.map((a, i) => (
                  <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-sm text-amber-300">
                    {typeof a === 'string' ? a : a.message ?? JSON.stringify(a)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sugestões */}
          {report.sugestoes?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-2">💡 Sugestões</p>
              <div className="space-y-2">
                {report.sugestoes.map((s, i) => (
                  <div key={i} className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
                    <p className="text-sm text-blue-300">{typeof s === 'string' ? s : s.sugestao ?? s.text ?? JSON.stringify(s)}</p>
                    {s.impacto && <p className="text-xs text-blue-500 mt-1">Impacto: {s.impacto}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="text-center py-8 text-gray-600">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">Selecione o período e clique em Analisar</p>
        </div>
      )}
    </Card>
  );
}

// ── Agente de Marketing ────────────────────────────────────────────
function MarketingSection() {
  const [type,    setType]    = useState('whatsapp');
  const [context, setContext] = useState('');
  const [copy,    setCopy]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [copied,  setCopied]  = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setCopy(null);
    try {
      const { data } = await generateMarketing(type, { contexto: context });
      setCopy(data.data?.copy ?? data.data?.content ?? JSON.stringify(data.data));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao gerar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!copy) return;
    await navigator.clipboard.writeText(copy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <SectionHeader emoji="📣" title="Agente de Marketing" subtitle="Gera copies e conteúdo personalizado para o seu restaurante" />

      <div className="space-y-3">
        {/* Tipo */}
        <div className="flex flex-wrap gap-2">
          {MARKETING_TYPES.map(m => (
            <button
              key={m.value}
              onClick={() => setType(m.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                type === m.value
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>

        {/* Contexto */}
        <textarea
          rows={2}
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="Contexto opcional: promoção de fim de semana, lançamento de prato, cardápio especial..."
          className="input w-full resize-none text-sm"
        />

        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors disabled:opacity-50 w-full justify-center"
        >
          {loading ? (
            <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
          ) : (
            '✨ Gerar copy'
          )}
        </button>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {copy && (
          <div className="relative">
            <div className="bg-gray-800 rounded-xl p-4 pr-10">
              <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{copy}</p>
            </div>
            <button
              onClick={handleCopy}
              title="Copiar"
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              {copied
                ? <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              }
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function AIInsightsPage() {
  const [showOcr, setShowOcr] = useState(false);

  const handleOcrApply = async (parsedData) => {
    if (!parsedData?.items?.length) return;
    try {
      await api.post('/ai/ocr/apply', {
        items:       parsedData.items,
        totalValue:  parsedData.totalValue,
        supplier:    parsedData.supplier,
        invoiceDate: parsedData.invoiceDate,
      });
      // Notifica outras páginas para refrescar o estoque
      window.dispatchEvent(new CustomEvent('stock:updated'));
    } catch (err) {
      console.error('[OCR Apply]', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-950 p-4 md:p-6 space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl shrink-0 shadow-lg shadow-purple-500/30">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">IA ZapFome</h1>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase tracking-widest">
                Beta
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Agentes inteligentes para o seu restaurante</p>
          </div>
        </div>
        <button
          onClick={() => setShowOcr(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors shadow-lg shadow-blue-900/40"
        >
          <span>📄</span>
          <span className="hidden sm:block">Nota Fiscal OCR</span>
        </button>
      </div>

      {/* Sections */}
      <DayMenuSection />
      <ManagerSection />
      <MarketingSection />

      {/* OCR Modal */}
      {showOcr && (
        <OcrInvoiceModal
          onClose={() => setShowOcr(false)}
          onApply={handleOcrApply}
        />
      )}
    </div>
  );
}
