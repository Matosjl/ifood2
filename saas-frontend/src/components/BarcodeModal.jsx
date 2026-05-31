import { useState, useEffect, useRef, useCallback } from 'react';
import { getByBarcode, lookupBarcode } from '../api/products';

/**
 * BarcodeModal — detecta automaticamente o código de barras.
 *
 * Não precisa configurar ENTER no scanner.
 * Lógica de auto-detecção:
 *   - Scanner envia todos os dígitos em < 100ms (muito mais rápido que digitação humana)
 *   - Quando o fluxo de teclas para por 300ms E o código tem >= 8 dígitos → dispara busca
 *   - OU quando ENTER é pressionado → dispara imediatamente
 */
export default function BarcodeModal({ onClose, onFoundProduct, onNewProduct }) {
  const [code,    setCode]    = useState('');
  const [status,  setStatus]  = useState('idle');
  const [message, setMessage] = useState('');
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);
  const lastKeyTs = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('keydown', h); clearTimeout(timerRef.current); };
  }, [onClose]);

  const search = useCallback(async (trimmed) => {
    if (!trimmed || trimmed.length < 4) return;
    setStatus('searching');
    setMessage('Buscando...');
    try {
      const { data: res } = await getByBarcode(trimmed);
      if (res.data) {
        setStatus('found');
        setMessage(`✅ ${res.data.name}`);
        setTimeout(() => { onFoundProduct(res.data); onClose(); }, 500);
        return;
      }
      setMessage('Consultando base online...');
      const { data: lookup } = await lookupBarcode(trimmed);
      if (lookup.data) {
        setStatus('notfound');
        setMessage(`📦 ${lookup.data.name}`);
        setTimeout(() => { onNewProduct({ ...lookup.data, barcode: trimmed }); onClose(); }, 700);
      } else {
        setStatus('notfound');
        setMessage('Não encontrado — preencha o cadastro.');
        setTimeout(() => { onNewProduct({ barcode: trimmed, name: '' }); onClose(); }, 900);
      }
    } catch {
      setStatus('error');
      setMessage('Erro ao buscar. Tente novamente.');
    }
  }, [onClose, onFoundProduct, onNewProduct]);

  const handleChange = (e) => {
    const val = e.target.value;
    setCode(val);
    if (status !== 'idle') { setStatus('idle'); setMessage(''); }

    const now = Date.now();
    const gap  = now - lastKeyTs.current;
    lastKeyTs.current = now;

    // Limpa timer anterior
    clearTimeout(timerRef.current);

    // Se gap entre teclas < 80ms = provavelmente scanner (não humano)
    // Aguarda 300ms de silêncio após >= 8 dígitos para disparar
    if (val.trim().length >= 8) {
      const delay = gap < 80 ? 300 : 800; // scanner → 300ms, humano → 800ms
      timerRef.current = setTimeout(() => search(val.trim()), delay);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timerRef.current);
      search(code.trim());
    }
  };

  const statusColor = {
    idle:      'text-gray-400',
    searching: 'text-blue-400',
    found:     'text-green-400',
    notfound:  'text-yellow-400',
    error:     'text-red-400',
  }[status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-black text-white">📷 Leitor de Código</h2>
            <p className="text-xs text-gray-500 mt-0.5">Aponte o scanner — detecta automático</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Ícone animado */}
          <div className="flex justify-center py-2">
            <div className={`w-20 h-20 rounded-2xl border flex items-center justify-center transition-colors ${
              status === 'searching' ? 'bg-blue-500/10 border-blue-500/30' :
              status === 'found'     ? 'bg-green-500/10 border-green-500/30' :
              status === 'notfound'  ? 'bg-yellow-500/10 border-yellow-500/30' :
              status === 'error'     ? 'bg-red-500/10 border-red-500/30' :
              'bg-gray-800/60 border-white/[0.06]'
            }`}>
              {status === 'searching' ? (
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : status === 'found' ? (
                <span className="text-3xl">✅</span>
              ) : status === 'notfound' ? (
                <span className="text-3xl">📦</span>
              ) : (
                <svg className="w-10 h-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 4h1v16H3V4zm3 0h1v16H6V4zm3 0h2v16H9V4zm4 0h1v16h-1V4zm3 0h1v16h-1V4zm3 0h1v16h-1V4z" />
                </svg>
              )}
            </div>
          </div>

          {/* Input */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1.5 block">
              Código de barras
              {code.length >= 8 && status === 'idle' && (
                <span className="ml-2 text-orange-400">detectando...</span>
              )}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className="input w-full text-center text-lg tracking-widest font-mono"
              placeholder="Aguardando leitura..."
              disabled={status === 'searching' || status === 'found'}
              autoComplete="off"
            />
            <p className="text-[11px] text-gray-600 mt-1.5 text-center">
              Dispara automaticamente ao ler · ENTER também funciona
            </p>
          </div>

          {/* Status */}
          {message && (
            <p className={`text-sm text-center font-semibold px-3 py-2 rounded-xl bg-gray-800/40 ${statusColor}`}>
              {message}
            </p>
          )}

          <p className="text-[11px] text-gray-600 text-center">ESC para fechar</p>
        </div>
      </div>
    </div>
  );
}
