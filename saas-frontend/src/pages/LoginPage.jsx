import { useState } from 'react';
import { login } from '../api/orders';
import { unlockAudio } from '../utils/sound';

export default function LoginPage({ onLogin }) {
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
      localStorage.setItem('token', data.data.accessToken);
      localStorage.setItem('user',  JSON.stringify(data.data.user));
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
          <div className="text-5xl mb-3">🍽</div>
          <h1 className="text-2xl font-black text-white">Painel da Cozinha</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de gestão de pedidos</p>
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
        </form>
      </div>
    </div>
  );
}
