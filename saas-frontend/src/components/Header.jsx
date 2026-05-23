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

const AUTO_CONFIRM_LABELS = { 0: 'OFF', 30: '30s', 60: '1min', 120: '2min', 300: '5min' };

export default function Header({
  connected, soundEnabled, setSoundEnabled,
  autoPrint, setAutoPrint,
  autoPrintKitchen, setAutoPrintKitchen,
  autoConfirmDelay, setAutoConfirmDelay, autoConfirmOptions,
  onNewOrder, viewMode, setViewMode, viewModes,
  pendingCount = 0,
}) {
  return (
    <header className="flex items-center gap-3 px-4 py-3 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">

      {/* Left — title + status + pending badge */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-base font-black tracking-tight text-white">🍽 Cozinha</span>

        {/* Pending orders badge */}
        {pendingCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black animate-pulse shadow-lg shadow-red-500/40">
            {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}

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

        {/* Auto-print toggle */}
        {setAutoPrint && (
          <button
            onClick={() => setAutoPrint(!autoPrint)}
            title={autoPrint ? 'Impressão automática: ON (clique para desligar)' : 'Impressão automática: OFF (clique para ligar)'}
            className={`p-2 rounded-lg transition-colors ${
              autoPrint ? 'text-blue-400 hover:bg-blue-400/10' : 'text-gray-600 hover:bg-white/10'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
        )}

        {/* Auto-print cozinha toggle */}
        {setAutoPrintKitchen && (
          <button
            onClick={() => setAutoPrintKitchen(!autoPrintKitchen)}
            title={autoPrintKitchen
              ? 'Comanda de cozinha automática: ON (clique para desligar)'
              : 'Comanda de cozinha automática: OFF (clique para ligar)'}
            className={`p-2 rounded-lg transition-colors ${
              autoPrintKitchen ? 'text-orange-400 hover:bg-orange-400/10' : 'text-gray-600 hover:bg-white/10'
            }`}
          >
            {/* chef hat icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>
              <line x1="6" y1="17" x2="18" y2="17"/>
            </svg>
          </button>
        )}

        {/* Auto-confirmação toggle */}
        {setAutoConfirmDelay && autoConfirmOptions && (
          <button
            onClick={() => {
              const idx = autoConfirmOptions.indexOf(autoConfirmDelay);
              const next = autoConfirmOptions[(idx + 1) % autoConfirmOptions.length];
              setAutoConfirmDelay(next);
            }}
            title={autoConfirmDelay > 0
              ? `Auto-confirmação: ${AUTO_CONFIRM_LABELS[autoConfirmDelay]} (clique para mudar)`
              : 'Auto-confirmação: OFF (clique para ligar)'}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              autoConfirmDelay > 0
                ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                : 'text-gray-600 hover:bg-white/10'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {autoConfirmDelay > 0 ? AUTO_CONFIRM_LABELS[autoConfirmDelay] : 'AC'}
          </button>
        )}

        {/* Notification permission */}
        {'Notification' in window && Notification.permission !== 'granted' && (
          <button
            onClick={() => Notification.requestPermission()}
            title="Ativar notificações do navegador"
            className="p-2 rounded-lg text-gray-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
        )}

        <FullscreenBtn />
      </div>
    </header>
  );
}
