import { useEffect } from 'react';

/**
 * Toast de notificação temporária.
 *
 * @param {string}  msg
 * @param {'success'|'error'|'warning'} type
 * @param {'bottom-right'|'top-center'} position
 * @param {number}  duration  ms até auto-fechar (default 3000)
 * @param {()=>void} onDone   chamado ao fechar (por timer ou clique)
 */
export default function Toast({
  msg,
  type     = 'success',
  position = 'bottom-right',
  duration = 3_000,
  onDone,
}) {
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  const posCls = position === 'top-center'
    ? 'fixed top-4 left-1/2 -translate-x-1/2 animate-fade-in'
    : 'fixed bottom-6 right-6';

  const colorCls = type === 'error'
    ? 'bg-red-900/95 border border-red-500/50 text-red-200'
    : type === 'warning'
    ? 'bg-yellow-900/95 border border-yellow-500/50 text-yellow-200'
    : 'bg-green-600 text-white';

  const icon = type === 'error' ? '⚠️' : type === 'warning' ? '⚡' : '✓';

  return (
    <div
      role="alert"
      className={`${posCls} z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold max-w-sm ${colorCls}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{msg}</span>
      <button
        onClick={onDone}
        aria-label="Fechar"
        className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100 transition-opacity"
      >×</button>
    </div>
  );
}
