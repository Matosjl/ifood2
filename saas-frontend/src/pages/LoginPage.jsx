import { useState } from 'react';
import { login } from '../api/orders';
import { unlockAudio } from '../utils/sound';

export default function LoginPage({ onLogin, onGoRegister, onGoLanding }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    unlockAudio(); // unlock Web Audio on first user gesture
    try {
      const { data } = await login(email, password);
      localStorage.setItem('token',  data.data.accessToken);
      localStorage.setItem('user',   JSON.stringify(data.data.user));
      localStorage.setItem('tenant', JSON.stringify(data.data.tenant));
      onLogin(data.data.accessToken);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {onGoLanding && (
            <button onClick={onGoLanding} className="inline-flex items-center gap-2 mb-4 text-gray-500 hover:text-white transition-colors text-sm">
              ← Voltar ao início
            </button>
          )}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-4xl">⚡</span>
            <span className="text-2xl font-black text-white">ZapFome</span>
          </div>
          <p className="text-gray-500 text-sm mt-1">Acesse seu painel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 border border-white/10 shadow-2xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
            <input
              type="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Senha</label>
            <input
              type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input w-full"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2 text-center">
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            className="btn-green w-full py-2.5 text-base disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {onGoRegister && (
            <p className="text-center text-sm text-gray-500 pt-2">
              Não tem conta?{' '}
              <button type="button" onClick={onGoRegister} className="text-orange-400 hover:text-orange-300 font-semibold">
                Teste grátis 14 dias
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
