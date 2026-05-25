import { useState, useEffect, useCallback } from 'react';
import { generatePixCharge, getPixStatus } from '../api/pix';

/**
 * PixQrModal — shows a PIX QR code for an order and auto-polls until paid.
 *
 * Props:
 *   order        — order object with id, total, orderNumber
 *   onClose()    — callback to close modal
 *   onPaid(id)   — called when payment confirmed
 */
export default function PixQrModal({ order, onClose, onPaid }) {
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);
  const [charge,  setCharge]    = useState(null); // { qrCode, brCode, link }
  const [paid,    setPaid]      = useState(false);
  const [copied,  setCopied]    = useState(false);

  const fmt = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ── Generate charge on mount ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await generatePixCharge(order.id);
        if (!cancelled) setCharge(data.data ?? data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message ?? 'Erro ao gerar QR Code PIX');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  // ── Poll for payment confirmation ──────────────────────────
  useEffect(() => {
    if (!charge || paid) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await getPixStatus(order.id);
        const result   = data.data ?? data;
        if (result.paid) {
          setPaid(true);
          clearInterval(interval);
          setTimeout(() => { onPaid?.(order.id); onClose?.(); }, 2000);
        }
      } catch {
        // silent — polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [charge, paid, order.id, onPaid, onClose]);

  const handleCopy = useCallback(async () => {
    const text = charge?.brCode ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  }, [charge]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-gray-900 rounded-3xl w-full max-w-sm border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-white">Pagar com PIX</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Pedido #{order.orderNumber ?? order.order_number ?? order.id?.slice(-6).toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none transition-colors"
          >×</button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Total */}
          <div className="text-center">
            <p className="text-3xl font-black text-green-400">{fmt(order.total)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Valor a pagar</p>
          </div>

          {/* QR Code */}
          {loading && (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Gerando QR Code...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <p className="text-gray-500 text-xs mt-1">
                Configure o App ID OpenPix em Configurações → Integrações.
              </p>
            </div>
          )}

          {paid && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center">
              <p className="text-4xl mb-2">✅</p>
              <p className="text-green-400 font-bold text-lg">PIX recebido!</p>
              <p className="text-gray-400 text-sm mt-1">Pedido confirmado automaticamente.</p>
            </div>
          )}

          {charge && !paid && (
            <>
              {/* QR image */}
              {charge.qrCode && (
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-2xl">
                    {charge.qrCode.startsWith('data:') ? (
                      <img src={charge.qrCode} alt="QR Code PIX" className="w-52 h-52" />
                    ) : (
                      <img src={charge.qrCode} alt="QR Code PIX" className="w-52 h-52" />
                    )}
                  </div>
                </div>
              )}

              {/* Pix Copia e Cola */}
              {charge.brCode && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pix Copia e Cola</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={charge.brCode}
                      className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 font-mono truncate"
                    />
                    <button
                      onClick={handleCopy}
                      className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                        copied
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {copied ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Polling indicator */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Aguardando pagamento...
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
