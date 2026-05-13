/**
 * LoginPage.jsx
 * Tela de login unificada do painel ZapFome.
 * Design: nocturne glassmorphism.
 */
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff, Loader2, Utensils, Lock } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/restaurantes";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    const result = await login(password);
    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.error || "Credenciais inválidas.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#051424",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "fixed", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(192,193,255,0.07) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "rgba(30,41,59,0.75)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148,163,184,0.15)",
          borderTop: "1px solid rgba(148,163,184,0.25)",
          borderLeft: "1px solid rgba(148,163,184,0.25)",
          borderRadius: 20,
          padding: 40,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 36 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: "linear-gradient(135deg, #c0c1ff, #8083ff)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 30px rgba(192,193,255,0.3)",
            }}
          >
            <Utensils size={26} style={{ color: "#1000a9" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#d4e4fa", margin: 0 }}>ZapFome</h1>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>Painel de Controle</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Password field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
              Senha
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={14}
                style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#64748b" }}
              />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  width: "100%",
                  background: "#122131",
                  border: "1px solid rgba(51,65,85,0.7)",
                  borderRadius: 10,
                  padding: "11px 42px 11px 38px",
                  color: "#d4e4fa",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#c0c1ff")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(51,65,85,0.7)")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 2,
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                background: "rgba(255,180,171,0.1)",
                border: "1px solid rgba(255,180,171,0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: "#ffb4ab",
              }}
            >
              {error}
            </motion.div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            style={{
              marginTop: 4,
              padding: "13px 0",
              borderRadius: 12,
              border: "none",
              cursor: isLoading || !password.trim() ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #c0c1ff, #8083ff)",
              color: "#1000a9",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: isLoading || !password.trim() ? 0.6 : 1,
              transition: "opacity 0.15s, transform 0.1s",
              boxShadow: "0 4px 24px rgba(192,193,255,0.2)",
            }}
            onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {isLoading ? (
              <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Autenticando...</>
            ) : (
              "Entrar no Painel"
            )}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#475569" }}>
          Senha definida em <code style={{ color: "#64748b" }}>OWNER_PASSWORD</code> no .env
        </p>
      </motion.div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
