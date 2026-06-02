/**
 * SplashScreen.jsx
 * Tela de entrada animada para o cardápio digital do cliente.
 * Versão: Logo animado (ícone desenhado + nome do restaurante).
 *
 * Props:
 *   restaurantName  {string}   — Nome do restaurante (vem de menuData.tenant.name)
 *   onDone          {function} — Chamada quando a animação termina
 *   duration        {number}   — Duração total em ms (padrão: 3800)
 */

import { useEffect, useRef } from 'react';

const DEFAULT_DURATION = 3800;

export default function SplashScreen({ restaurantName = 'Restaurante', onDone, duration = DEFAULT_DURATION }) {
  const splashRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = splashRef.current;
      if (!el) { onDone?.(); return; }
      el.style.opacity = '0';
      el.style.transform = 'scale(1.04)';
      setTimeout(() => onDone?.(), 650);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <>
      <style>{`
        @keyframes __splash_pulse_ring {
          0%   { opacity: 0; transform: scale(0.85); }
          30%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.45); }
        }
        @keyframes __splash_icon_in {
          from { opacity: 0; transform: scale(0.3); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes __splash_draw_path {
          to { stroke-dashoffset: 0; }
        }
        @keyframes __splash_glow {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes __splash_name_in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes __splash_slogan_in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes __splash_bar_appear {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes __splash_bar_fill {
          from { width: 0; }
          to   { width: 100%; }
        }

        .__splash_pulse_ring {
          position: absolute;
          inset: -18px;
          border-radius: 50%;
          border: 1.5px solid rgba(249,115,22,0.18);
          opacity: 0;
          animation: __splash_pulse_ring 2.2s ease-out infinite;
        }
        .__splash_pulse_ring:nth-child(2) { animation-delay: 0.65s; }
        .__splash_pulse_ring:nth-child(3) { animation-delay: 1.3s; }

        .__splash_icon_circle {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          background: radial-gradient(135deg at 30% 30%, #1c1008, #120b04);
          border: 1.5px solid rgba(249,115,22,0.28);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          animation: __splash_icon_in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both;
          box-shadow: 0 0 40px rgba(249,115,22,0.10), inset 0 0 20px rgba(249,115,22,0.04);
        }

        .__splash_fork_path {
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
          animation: __splash_draw_path 0.55s ease forwards;
        }
        .__splash_fork_path:nth-child(1) { animation-delay: 0.85s; }
        .__splash_fork_path:nth-child(2) { animation-delay: 1.05s; }
        .__splash_fork_path:nth-child(3) { animation-delay: 1.25s; }
        .__splash_fork_path:nth-child(4) { animation-delay: 1.45s; }

        .__splash_icon_glow {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 50%, rgba(249,115,22,0.09), transparent 70%);
          animation: __splash_glow 1.2s ease 2s infinite alternate;
          opacity: 0;
        }

        .__splash_name {
          font-size: clamp(24px, 7vw, 36px);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #f9f9f9;
          text-align: center;
          animation: __splash_name_in 0.45s ease 1.8s both;
          max-width: 280px;
          line-height: 1.15;
        }

        .__splash_slogan {
          font-size: 12px;
          color: #f97316;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 600;
          animation: __splash_slogan_in 0.45s ease 2.2s both;
          opacity: 0;
        }

        .__splash_progress_wrap {
          position: absolute;
          bottom: 44px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          animation: __splash_bar_appear 0.3s ease 2.5s both;
          opacity: 0;
        }

        .__splash_progress_bar {
          width: 56px;
          height: 2px;
          background: rgba(255,255,255,0.08);
          border-radius: 2px;
          overflow: hidden;
        }

        .__splash_progress_fill {
          height: 100%;
          background: #f97316;
          border-radius: 2px;
          width: 0;
        }

        .__splash_progress_label {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.22);
        }
      `}</style>

      <div
        ref={splashRef}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'linear-gradient(160deg, #0f0a06 0%, #1a0e06 50%, #0f0a06 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '28px',
          zIndex: 9999,
          transition: 'opacity 0.65s ease, transform 0.65s ease',
        }}
      >
        {/* Ícone animado */}
        <div style={{ position: 'relative', width: 110, height: 110 }}>
          <div className="__splash_pulse_ring" />
          <div className="__splash_pulse_ring" />
          <div className="__splash_pulse_ring" />

          <div className="__splash_icon_circle">
            <div className="__splash_icon_glow" />

            {/* Garfo + prato SVG desenhado */}
            <svg width="52" height="52" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Cabo do garfo */}
              <path
                className="__splash_fork_path"
                d="M20 44 L20 28"
                stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
              />
              {/* Corpo do garfo (U) */}
              <path
                className="__splash_fork_path"
                d="M16 14 L16 24 C16 26.2 17.8 28 20 28 C22.2 28 24 26.2 24 24 L24 14"
                stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              />
              {/* Dente central */}
              <path
                className="__splash_fork_path"
                d="M20 14 L20 22"
                stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
              />
              {/* Prato / tampa cloche */}
              <path
                className="__splash_fork_path"
                d="M28 36 C28 36 31 31 40 31 C40 37 36.5 42 31 43 C28.5 43.5 28 42 28 41 L28 36Z"
                stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Nome do restaurante */}
        <div className="__splash_name">{restaurantName}</div>

        {/* Slogan */}
        <div className="__splash_slogan">Bem‑vindo · Bom apetite</div>

        {/* Barra de progresso */}
        <div className="__splash_progress_wrap">
          <div className="__splash_progress_bar">
            <div
              className="__splash_progress_fill"
              style={{
                animation: `__splash_bar_fill ${(duration - 2500) / 1000}s linear 2.5s both`,
              }}
            />
          </div>
          <span className="__splash_progress_label">Abrindo cardápio</span>
        </div>
      </div>
    </>
  );
}
