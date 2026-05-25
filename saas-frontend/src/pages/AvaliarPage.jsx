import { useState, useEffect } from 'react';
import api from '../api/axios';

const fmt = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function StarButton({ n, selected, hover, onHover, onLeave, onClick }) {
  const filled = n <= (hover || selected);
  return (
    <button
      onMouseEnter={() => onHover(n)}
      onMouseLeave={onLeave}
      onClick={() => onClick(n)}
      className="text-4xl transition-transform hover:scale-110 active:scale-95 select-none"
      aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
    >
      {filled ? '⭐' : '☆'}
    </button>
  );
}

export default function AvaliarPage({ token }) {
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [rating,    setRating]    = useState(null);   // API data
  const [stars,     setStars]     = useState(0);
  const [hover,     setHover]     = useState(0);
  const [comment,   setComment]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,      setDone]      = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    api.get(`/ratings/public/${token}`)
      .then(({ data }) => {
        const r = data.data ?? data;
        // If already rated (stars > 0 stored but token was nulled — won't reach here normally)
        setRating(r);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message ?? 'Link inválido ou expirado';
        if (msg.includes('avaliado')) setAlreadyDone(true);
        else setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!stars) return;
    setSubmitting(true);
    try {
      await api.post(`/ratings/public/${token}`, { stars, comment });
      setDone(true);
    } catch (err) {
      const msg = err?.response?.data?.message ?? 'Erro ao enviar avaliação';
      if (msg.includes('avaliado')) setAlreadyDone(true);
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const STAR_LABELS = { 0: '', 1: 'Muito ruim 😞', 2: 'Ruim 😕', 3: 'Regular 😐', 4: 'Bom 😊', 5: 'Excelente! 🤩' };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center text-3xl mx-auto mb-3">
            🍽️
          </div>
          {rating && (
            <p className="text-lg font-black text-white">{rating.tenant_name}</p>
          )}
        </div>

        <div className="bg-gray-900 rounded-3xl border border-white/[0.06] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-3xl">😕</p>
              <p className="text-gray-400 text-sm">{error}</p>
            </div>
          ) : alreadyDone ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-4xl">✅</p>
              <p className="text-white font-bold text-lg">Obrigado!</p>
              <p className="text-gray-400 text-sm">Este pedido já foi avaliado anteriormente.</p>
            </div>
          ) : done ? (
            <div className="p-8 text-center space-y-4">
              <p className="text-5xl animate-bounce">🎉</p>
              <p className="text-white font-black text-xl">Obrigado pela avaliação!</p>
              <p className="text-gray-400 text-sm">Seu feedback nos ajuda a melhorar sempre.</p>
              <div className="flex justify-center gap-1 text-2xl">
                {Array.from({ length: stars }, (_, i) => <span key={i}>⭐</span>)}
              </div>
            </div>
          ) : (
            <>
              {/* Order info */}
              <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Pedido</p>
                <p className="text-sm font-semibold text-gray-200">
                  #{rating?.order_number ?? '—'}
                  {rating?.customer_name ? ` · ${rating.customer_name}` : ''}
                </p>
                {rating?.total > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">{fmt(rating.total)}</p>
                )}
              </div>

              {/* Stars */}
              <div className="px-6 py-6 space-y-4">
                <p className="text-base font-bold text-white text-center">Como foi seu pedido?</p>

                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <StarButton
                      key={n}
                      n={n}
                      selected={stars}
                      hover={hover}
                      onHover={setHover}
                      onLeave={() => setHover(0)}
                      onClick={setStars}
                    />
                  ))}
                </div>

                <p className="text-center text-sm text-gray-400 h-5">
                  {STAR_LABELS[hover || stars]}
                </p>

                {/* Comment */}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Deixe um comentário (opcional)..."
                  rows={3}
                  className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
                />

                <button
                  onClick={handleSubmit}
                  disabled={!stars || submitting}
                  className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-black text-base hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Enviando...' : 'Enviar avaliação'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-700 mt-6">Powered by ZapFome</p>
      </div>
    </div>
  );
}
