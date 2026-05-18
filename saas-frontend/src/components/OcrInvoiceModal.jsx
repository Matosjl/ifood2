import { useState, useRef, useCallback } from 'react';
import { submitOcrInvoice, getOcrJob } from '../api/ai';

const POLL_INTERVAL = 2000;   // 2s entre checks
const MAX_POLLS     = 30;     // até 60s de espera

function formatCurrency(v) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * OcrInvoiceModal — Envio de nota fiscal por foto, OCR via GPT-4o-mini,
 * exibição dos itens parseados e botão para aplicar ao estoque/despesas.
 *
 * Props:
 *   onClose()           — fecha o modal
 *   onApply(parsedData) — chamada quando o usuário confirma os itens
 */
export default function OcrInvoiceModal({ onClose, onApply }) {
  const inputRef     = useRef(null);
  const pollRef      = useRef(null);
  const pollCount    = useRef(0);

  const [phase,    setPhase]    = useState('upload'); // upload | processing | done | error
  const [preview,  setPreview]  = useState(null);
  const [base64,   setBase64]   = useState(null);
  const [jobId,    setJobId]    = useState(null);
  const [result,   setResult]   = useState(null);
  const [errMsg,   setErrMsg]   = useState('');

  // ── Converte File → base64 ────────────────────────────────────
  const fileToBase64 = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrMsg('Apenas imagens são aceitas (JPG, PNG, HEIC).');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    const b64 = await fileToBase64(file);
    setBase64(b64);
    setErrMsg('');
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = (e) => handleFile(e.target.files?.[0]);

  // ── Inicia OCR ────────────────────────────────────────────────
  const startOcr = async () => {
    if (!base64) return;
    setPhase('processing');
    setErrMsg('');
    try {
      const { data } = await submitOcrInvoice(base64);
      const id = data.data?.jobId;
      if (!id) throw new Error('jobId não retornado');
      setJobId(id);
      pollCount.current = 0;
      pollRef.current = setInterval(() => pollJob(id), POLL_INTERVAL);
    } catch (err) {
      setErrMsg(err.response?.data?.message ?? 'Erro ao enviar imagem.');
      setPhase('error');
    }
  };

  const pollJob = async (id) => {
    pollCount.current++;
    if (pollCount.current > MAX_POLLS) {
      clearInterval(pollRef.current);
      setErrMsg('Timeout: OCR demorou mais que o esperado. Tente novamente.');
      setPhase('error');
      return;
    }
    try {
      const { data } = await getOcrJob(id);
      const job = data.data;
      if (job?.status === 'done') {
        clearInterval(pollRef.current);
        setResult(job.parsedData ?? job.result);
        setPhase('done');
      } else if (job?.status === 'error') {
        clearInterval(pollRef.current);
        setErrMsg(job.error ?? 'OCR falhou.');
        setPhase('error');
      }
      // 'processing' ou 'pending' → continua polling
    } catch {
      // ignora erros de rede transientes
    }
  };

  const reset = () => {
    clearInterval(pollRef.current);
    setPhase('upload');
    setPreview(null);
    setBase64(null);
    setJobId(null);
    setResult(null);
    setErrMsg('');
    pollCount.current = 0;
  };

  const handleApply = () => {
    if (result && onApply) onApply(result);
    onClose();
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-black text-white">📄 OCR — Nota Fiscal</h2>
            <p className="text-xs text-gray-500 mt-0.5">Envie uma foto da nota para extrair itens automaticamente</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Upload zone */}
          {phase === 'upload' && (
            <>
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
              >
                {preview ? (
                  <img src={preview} alt="Prévia" className="max-h-48 mx-auto rounded-lg object-contain" />
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">📷</div>
                    <p className="text-sm text-gray-400">Arraste a foto aqui ou <span className="text-blue-400 group-hover:underline">clique para escolher</span></p>
                    <p className="text-xs text-gray-600">JPG, PNG, HEIC — máx. 10 MB</p>
                  </div>
                )}
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
              </div>

              {errMsg && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{errMsg}</p>}

              {preview && (
                <div className="flex gap-2">
                  <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 font-semibold text-sm transition-colors">
                    Trocar imagem
                  </button>
                  <button onClick={startOcr} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">
                    🔍 Extrair itens
                  </button>
                </div>
              )}
            </>
          )}

          {/* Processing */}
          {phase === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
              <div className="text-center">
                <p className="text-white font-semibold">Processando nota fiscal...</p>
                <p className="text-xs text-gray-500 mt-1">GPT-4o-mini está lendo os itens</p>
              </div>
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <div className="text-3xl mb-2">❌</div>
                <p className="text-sm text-red-400 font-semibold">{errMsg || 'Erro no OCR'}</p>
              </div>
              <button onClick={reset} className="w-full py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold text-sm transition-colors">
                Tentar novamente
              </button>
            </div>
          )}

          {/* Done — show parsed items */}
          {phase === 'done' && result && (
            <div className="space-y-4">
              {/* Cabeçalho da nota */}
              <div className="bg-gray-800 rounded-xl p-3 space-y-1 text-xs">
                {result.supplier    && <p className="text-gray-300"><span className="text-gray-500">Fornecedor:</span> {result.supplier}</p>}
                {result.invoiceDate && <p className="text-gray-300"><span className="text-gray-500">Data:</span> {result.invoiceDate}</p>}
                {result.invoiceNumber && <p className="text-gray-300"><span className="text-gray-500">Número:</span> {result.invoiceNumber}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-gray-500">Confiança:</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${result.confidence >= 0.8 ? 'bg-green-400' : result.confidence >= 0.6 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${(result.confidence ?? 0) * 100}%` }}
                    />
                  </div>
                  <span className={result.confidence >= 0.8 ? 'text-green-400' : 'text-yellow-400'}>
                    {Math.round((result.confidence ?? 0) * 100)}%
                  </span>
                </div>
              </div>

              {/* Itens */}
              <div className="bg-gray-800/50 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wide grid grid-cols-12 gap-2">
                  <span className="col-span-5">Item</span>
                  <span className="col-span-2 text-center">Qtd</span>
                  <span className="col-span-2 text-right">Unit.</span>
                  <span className="col-span-3 text-right">Total</span>
                </div>
                <div className="divide-y divide-white/[0.04] max-h-48 overflow-y-auto">
                  {(result.items ?? []).map((item, i) => (
                    <div key={i} className="px-3 py-2 text-xs grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-5 text-white truncate" title={item.name}>{item.name}</span>
                      <span className="col-span-2 text-center text-gray-400">{item.qty} {item.unit || 'un'}</span>
                      <span className="col-span-2 text-right text-gray-400">{formatCurrency(item.unitPrice)}</span>
                      <span className="col-span-3 text-right text-green-400 font-semibold">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-gray-800 text-xs font-black text-white flex justify-between">
                  <span>Total da nota</span>
                  <span className="text-green-400">{formatCurrency(result.totalValue)}</span>
                </div>
              </div>

              {result.confidence < 0.6 && (
                <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
                  ⚠️ Confiança baixa — revise os itens antes de aplicar.
                </p>
              )}

              <div className="flex gap-2">
                <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 font-semibold text-sm transition-colors">
                  Nova nota
                </button>
                <button onClick={handleApply} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors">
                  ✅ Aplicar ao estoque
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
