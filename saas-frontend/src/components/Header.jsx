import { useState, useEffect } from 'react';

function FullscreenBtn() {
  const [fs, setFs] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handler = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggle = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <button onClick={toggle} title={fs ? 'Sair da tela cheia' : 'Tela cheia'}
      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
      {fs
        ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M15 9h4.5M15 9V4.5M15 9l5.25-5.25M9 15H4.5M9 15v4.5M9 15l-5.25 5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
        : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
      }
    </button>
  );
}

export default function Header({
  connected, soundEnabled, setSoundEnabled, onNewOrder,
  viewMode, setViewMode, viewModes,
}) {
  return (
    <header className="flex items-center gap-3 px-4 py-3 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">

      {/* Left — title + status */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-base font-black tracking-tight text-white">🍽 Cozinha</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-400 animate-pulse'}`} />
          <span className="text-xs text-gray-500 hidden sm:block">
            {connected ? 'Ao vivo' : 'Reconectando...'}
          </span>
        </div>
      </div>

      {/* Center — view mode toggle */}
      {viewModes && (
        <div className="hidden sm:flex flex-1 justify-center">
          <div className="flex items-center gap-1 bg-gray-800/70 rounded-xl p-1">
            {viewModes.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  viewMode === id
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-300',
                ].join(' ')}
              >
                <span className="text-sm">{icon}</span>
                <span className="hidden lg:block">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right — actions */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {/* Novo Pedido */}
        <button
          onClick={onNewOrder}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-green-900/40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:block">Novo Pedido</span>
        </button>

        {/* Sound toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Silenciar' : 'Ativar som'}
          className={`p-2 rounded-lg transition-colors ${
            soundEnabled ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-gray-600 hover:bg-white/10'
          }`}
        >
          {soundEnabled
            ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
          }
        </button>

        <FullscreenBtn />
      </div>
    </header>
  );
}
