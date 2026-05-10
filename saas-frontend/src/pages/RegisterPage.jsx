import { useState } from 'react';
import api from '../api/axios';

export default function RegisterPage({ onLogin, onGoLogin }) {
  const [form, setForm] = useState({
    tenantName: '',
    name: '',
    email: '',
    password: '',
  });
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      return setError('A senha deve ter pelo menos 8 caracteres.');
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/trial-register', form);
      const { accessToken, refreshToken, user, tenant } = data.data;
      localStorage.setItem('token',        accessToken);
      localStorage.setItem('refreshToken', refreshToken ?? '');
      localStorage.setItem('user',         JSON.stringify(user));
      localStorage.setItem('tenant',       JSON.stringify(tenant));
      onLogin(accessToken);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-4xl">⚡</span>
            <span className="text-3xl font-black text-white">ZapFome</span>
          </div>
          <p className="text-gray-400 font-semibold">Crie sua conta grátis</p>
          <p className="text-sm text-orange-400 mt-1">3 dias Premium + 7 dias Basic grátis · Sem cartão</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 border border-white/10 shadow-2xl space-y-4">

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
              Nome do restaurante *
            </label>
            <input
              required
              autoFocus
              placeholder="Ex: Pizzaria Bella Napoli"
              value={form.tenantName}
              onChange={set('tenantName')}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
              Seu nome *
            </label>
            <input
              required
              placeholder="Ex: Carlos Silva"
              value={form.name}
              onChange={set('name')}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
              E-mail *
            </label>
            <input
              required
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={set('email')}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
              Senha *
            </label>
            <input
              required
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={set('password')}
              className="input w-full"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Trial badge */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-orange-400 text-lg flex-shrink-0 mt-0.5">🎁</span>
            <div>
              <p className="text-orange-300 text-sm font-bold">14 dias completamente grátis</p>
              <p className="text-gray-500 text-xs mt-0.5">Acesso total a todas as funcionalidades. Sem cartão de crédito necessário.</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-base font-black bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-yellow-400 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-orange-500/20"
          >
            {loading ? 'Criando conta...' : 'Criar conta grátis →'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <button type="button" onClick={onGoLogin} className="text-orange-400 hover:text-orange-300 font-semibold">
              Entrar
            </button>
          </p>
        </form>

        <p className="text-center text-xs text-gray-700 mt-4">
          Ao criar conta você concorda com os Termos de Uso e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}
