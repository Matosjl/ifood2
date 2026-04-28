import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

export function OwnerLogin({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/owner/login`, { password });
      localStorage.setItem("owner_token", res.data.token);
      onLogin?.(res.data.token);
      navigate("/owner");
    } catch (err) {
      const detail = err.response?.data?.detail || "Erro ao conectar ao servidor.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="border border-[#27272A] bg-[#0A0A0A] p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[#00E559] text-sm tracking-[0.2em]">AJAX OWNER</span>
            <span className="font-mono text-xs text-[#71717A]">Acesso restrito ao proprietário</span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[#71717A]">SENHA</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-3 py-2"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 px-6 hover:bg-[#00c44d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "AUTENTICANDO..." : "ENTRAR"}
            </button>
          </form>

          <div className="flex flex-col gap-2 border-t border-[#27272A] pt-4">
            <button
              onClick={() => navigate("/")}
              className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED] transition-colors text-left"
            >
              ← Voltar ao AJAX
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await axios.post(`${API}/owner/recovery/request`);
                  setError(`Token de recuperação: ${res.data.token} (válido 30min)`);
                } catch {
                  setError("Erro ao solicitar recuperação.");
                }
              }}
              className="font-mono text-[10px] text-[#3F3F46] hover:text-[#71717A] transition-colors text-left"
            >
              Esqueci a senha
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
