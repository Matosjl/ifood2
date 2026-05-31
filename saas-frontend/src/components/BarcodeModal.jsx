import { useState, useEffect, useRef } from 'react';
import { getByBarcode, lookupBarcode } from '../api/products';

/**
 * BarcodeModal — leitura de código de barras via scanner USB/Bluetooth.
 *
 * Fluxo:
 *  1. Campo focado automaticamente aguarda o scanner enviar código + ENTER
 *  2. Busca produto no banco pelo barcode
 *     - Encontrou → chama onFoundProduct(product) para editar/repor estoque
 *     - Não encontrou → consulta Open Food Facts → chama onNewProduct(prefill)
 *       com name, barcode pré-preenchidos para abrir modal de criação
 */
export default function BarcodeModal({ onClose, onFoundProduct, onNewProduct }) {
  const [code,    setCode]    = useState('');
  const [status,  setStatus]  = useState('idle'); // idle | searching | found | notfound | error
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleScan = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setStatus('searching');
    setMessage('Buscando...');

    try {
      // 1. Busca no banco do tenant
      const { data: res } = await getByBarcode(trimmed);
      if (res.data) {
        setStatus('found');
        setMessage(`✅ Encontrado: ${res.data.name}`);
        setTimeout(() => {
          onFoundProduct(res.data);
          onClose();
        }, 600);
        return;
      }

      // 2. Não existe — consulta Open Food Facts
      setMessage('Produto não cadastrado. Buscando informações online...');
      const { data: lookup } = await lookupBarcode(trimmed);

      if (lookup.data) {
        setStatus('notfound');
        setMessage(`📦 Encontrado online: ${lookup.data.name}`);
        setTimeout(() => {
          onNewProduct({ ...lookup.data, barcode: trimmed });
          onClose();
        }, 800);
      } else {
        setStatus('notfound');
        setMessage('Produto não encontrado online. Cadastre manualmente.');
        setTimeout(() => {
          onNewProduct({ barcode: trimmed, name: '' });
          onClose();
        }, 1000);
      }
    } catch {
      setStatus('error');
      setMessage('Erro ao buscar produto. Tente novamente.');
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
            <p className="text-xs text-gray-500 mt-0.5">Aponte o scanner para o produto</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleScan} className="p-5 space-y-4">
          {/* Ícone de scanner */}
          <div className="flex justify-center py-2">
            <div className="w-20 h-20 rounded-2xl bg-gray-800/60 border border-white/[0.06] flex items-center justify-center">
              <svg className="w-10 h-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 4h1v16H3V4zm3 0h1v16H6V4zm3 0h2v16H9V4zm4 0h1v16h-1V4zm3 0h1v16h-1V4zm3 0h1v16h-1V4z" />
              </svg>
            </div>
          </div>

          {/* Input de código */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1.5 block">
              Código de barras
            </label>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan(e)}
              className="input w-full text-center text-lg tracking-widest font-mono"
              placeholder="Aguardando leitura..."
              disabled={status === 'searching' || status === 'found'}
              autoComplete="off"
            />
            <p className="text-[11px] text-gray-600 mt-1 text-center">
              Configure o scanner para enviar ENTER após a leitura
            </p>
          </div>

          {/* Status */}
          {message && (
            <p className={`text-xs text-center font-semibold ${statusColor}`}>{message}</p>
          )}

          {/* Botão manual */}
          <button
            type="submit"
            disabled={!code.trim() || status === 'searching' || status === 'found'}
            className="w-full btn-green py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'searching' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Buscando...
              </span>
            ) : 'Buscar produto'}
          </button>

          <p className="text-[11px] text-gray-600 text-center">
            ESC para fechar
          </p>
        </form>
      </div>
    </div>
  );
}
