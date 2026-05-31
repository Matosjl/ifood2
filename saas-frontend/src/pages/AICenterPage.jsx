import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';

// ── Intent badge ────────────────────────────────────────────────────
const INTENT_META = {
  manager:           { label: 'Análise',    color: 'bg-blue-500/20 text-blue-300',    icon: '📊' },
  marketing:         { label: 'Copy',       color: 'bg-purple-500/20 text-purple-300', icon: '✍️' },
  financial:         { label: 'Financeiro', color: 'bg-green-500/20 text-green-300',  icon: '💰' },
  campaign_dispatch: { label: '🚀 Disparo', color: 'bg-orange-500/20 text-orange-300', icon: '📣' },
  recovery:          { label: 'Recuperação', color: 'bg-yellow-500/20 text-yellow-300', icon: '♻️' },
  report_send:       { label: 'Relatório',  color: 'bg-cyan-500/20 text-cyan-300',    icon: '📤' },
  chat:              { label: 'Chat',       color: 'bg-gray-500/20 text-gray-300',    icon: '💬' },
};

// ── Quick actions chips ──────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: '📊', label: 'Resumo da semana',      msg: 'Me dê um resumo das vendas da semana' },
  { icon: '📣', label: 'Disparar campanha',      msg: 'Criar e disparar uma promoção de pizza hoje no WhatsApp' },
  { icon: '♻️', label: 'Recuperar clientes',    msg: 'Quais clientes estão sem comprar há 15 dias? Quero reativar eles' },
  { icon: '✍️', label: 'Post Instagram',         msg: 'Crie uma legenda para o Instagram do restaurante' },
  { icon: '📤', label: 'Relatório no WhatsApp',  msg: 'Me manda o relatório de hoje no WhatsApp' },
  { icon: '💰', label: 'Ver faturamento',        msg: 'Como estão as vendas hoje?' },
];

// ── Markdown-like renderer (bold + linebreaks + code blocks) ────────
function RenderMessage({ text }) {
  if (!text) return null;

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
          return (
            <pre key={i} className="bg-gray-900/80 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
              {code}
            </pre>
          );
        }
        // Process **bold** and newlines
        const lines = part.split('\n');
        return (
          <div key={i}>
            {lines.map((line, li) => {
              const segments = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <span key={li}>
                  {segments.map((seg, si) =>
                    seg.startsWith('**') && seg.endsWith('**')
                      ? <strong key={si} className="text-white font-bold">{seg.slice(2, -2)}</strong>
                      : <span key={si}>{seg}</span>
                  )}
                  {li < lines.length - 1 && <br />}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Typing indicator ────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-orange-400 typing-dot"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

// ── Webhook status bar ──────────────────────────────────────────────
function WebhookStatusBar({ status }) {
  if (!status) return null;
  const { n8n, vps2, webhooks } = status;
  const chips = [
    { label: 'AI Engine', ok: vps2?.healthy,       icon: '🤖' },
    { label: 'n8n',       ok: n8n?.healthy,         icon: '⚙️' },
    { label: 'Campanha',  ok: webhooks?.campaign,   icon: '📣' },
    { label: 'Recuperação', ok: webhooks?.recovery, icon: '♻️' },
    { label: 'Relatório', ok: webhooks?.report,     icon: '📤' },
  ];
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-900/60 border-b border-white/5 overflow-x-auto">
      <span className="text-[10px] text-gray-600 shrink-0">Integrações</span>
      {chips.map((c) => (
        <span key={c.label} className={`shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium
          ${c.ok ? 'bg-green-500/10 text-green-400' : 'bg-gray-700/60 text-gray-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-green-400' : 'bg-gray-600'}`} />
          {c.icon} {c.label}
        </span>
      ))}
    </div>
  );
}

// ── Context stats bar ───────────────────────────────────────────────
function ContextBar({ context }) {
  if (!context || Object.keys(context).length === 0) return null;
  const fmt = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-800/50 border-b border-white/5 text-xs text-gray-400 overflow-x-auto">
      <span className="shrink-0">📍 Contexto</span>
      <span className="shrink-0">🛒 Hoje: <span className="text-white font-bold">{context.ordersToday || 0} pedidos</span></span>
      <span className="shrink-0">💵 Hoje: <span className="text-white font-bold">{fmt(context.revenueToday)}</span></span>
      {(context.revenueWeek > 0) && (
        <span className="shrink-0">📅 Semana: <span className="text-green-400 font-bold">{fmt(context.revenueWeek)}</span></span>
      )}
      {(context.revenueMonth > 0) && (
        <span className="shrink-0">🗓️ Mês: <span className="text-blue-400 font-bold">{fmt(context.revenueMonth)}</span></span>
      )}
      {context.ordersOpen > 0 && (
        <span className="shrink-0 text-orange-400">⏳ {context.ordersOpen} em aberto</span>
      )}
      {context.cancelledToday > 0 && (
        <span className="shrink-0 text-red-400">❌ {context.cancelledToday} cancelados</span>
      )}
    </div>
  );
}

// ── Message bubble ──────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const meta   = INTENT_META[msg.intent] || INTENT_META.chat;
  const time   = new Date(msg.created_at || msg.ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] md:max-w-[65%]">
          <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
            {msg.content}
          </div>
          <div className="text-right text-[11px] text-gray-600 mt-1 mr-1">{time}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3 gap-3">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-sm shrink-0 mt-1 shadow-lg shadow-orange-500/20">
        ⚡
      </div>
      <div className="max-w-[80%] md:max-w-[75%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold text-orange-400">ZapFome IA</span>
          {msg.intent && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
          )}
        </div>
        <div className="bg-gray-800 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed">
          <RenderMessage text={msg.content} />
        </div>
        <div className="text-left text-[11px] text-gray-600 mt-1 ml-1">{time}</div>
      </div>
    </div>
  );
}

// ── Status color helper ──────────────────────────────────────────────
const STATUS_COLOR = {
  success:  'bg-green-500/15 text-green-400',
  error:    'bg-red-500/15 text-red-400',
  timeout:  'bg-yellow-500/15 text-yellow-400',
  fallback: 'bg-gray-500/15 text-gray-400',
};

// ── Logs Panel ───────────────────────────────────────────────────────
function LogsPanel({ logs, loading }) {
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
  if (!logs.length) return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm gap-2">
      <span className="text-3xl">🔍</span>
      <span>Nenhum log ainda. Use o chat para ver execuções aqui.</span>
    </div>
  );
  return (
    <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
      {logs.map((log) => {
        const meta = INTENT_META[log.intent] || INTENT_META.chat;
        const sc   = STATUS_COLOR[log.status] || STATUS_COLOR.fallback;
        const time = new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const date = new Date(log.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return (
          <div key={log.id} className="bg-gray-800/60 border border-white/5 rounded-xl px-4 py-3 text-xs hover:bg-gray-800 transition">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {/* time */}
              <span className="text-gray-500 shrink-0">{date} {time}</span>
              {/* intent */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>
                {meta.icon} {meta.label}
              </span>
              {/* status */}
              <span className={`px-2 py-0.5 rounded-full font-semibold ${sc}`}>
                {log.status}
              </span>
              {/* duration */}
              {log.duration_ms && (
                <span className="text-gray-500">⏱ {log.duration_ms}ms</span>
              )}
              {/* n8n badge */}
              {log.n8n_called && (
                <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold">⚙️ n8n</span>
              )}
            </div>
            {/* input preview */}
            <p className="text-gray-400 truncate">{log.input_preview}</p>
            {/* error */}
            {log.error && (
              <p className="text-red-400 mt-1 truncate">❌ {log.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Agents Panel ─────────────────────────────────────────────────────
function AgentsPanel({ agents, loading }) {
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
  return (
    <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
      <p className="text-xs text-gray-500 mb-2">
        Agentes registrados no sistema. Cada intent roteia automaticamente para o agente correto.
      </p>
      {agents.map((ag) => (
        <div key={ag.slug} className={`bg-gray-800/60 border rounded-xl px-4 py-3 transition ${ag.active ? 'border-white/5' : 'border-dashed border-white/5 opacity-50'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${ag.active ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="font-bold text-white text-sm">{ag.name}</span>
              <span className="text-[10px] text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-mono">{ag.slug}</span>
            </div>
            <span className="text-[10px] text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded">
              prio {ag.priority}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{ag.description}</p>
          <div className="flex flex-wrap gap-1">
            {(ag.capabilities || []).map((cap) => (
              <span key={cap} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                {cap}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Welcome screen (empty state) ────────────────────────────────────
function WelcomeScreen({ onQuickAction }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-6">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-4xl shadow-2xl shadow-orange-500/30">
        ⚡
      </div>
      <div>
        <h2 className="text-2xl font-black text-white mb-2">IA ZapFome</h2>
        <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
          Seu assistente inteligente para análise de vendas, marketing e gestão do restaurante.
          Pergunte qualquer coisa!
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-lg">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => onQuickAction(a.msg)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-white/5 hover:border-orange-500/30 text-left text-xs text-gray-300 hover:text-white transition-all group"
          >
            <span className="text-base shrink-0">{a.icon}</span>
            <span className="font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function AICenterPage() {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [fetching,   setFetching]   = useState(true);
  const [lastCtx,    setLastCtx]    = useState(null);
  const [error,      setError]      = useState(null);
  const [svcStatus,  setSvcStatus]  = useState(null);
  // Tabs: 'chat' | 'logs' | 'agents'
  const [tab,        setTab]        = useState('chat');
  const [logs,       setLogs]       = useState([]);
  const [logsLoading,setLogsLoading]= useState(false);
  const [agents,     setAgents]     = useState([]);
  const [agLoading,  setAgLoading]  = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  // Load history + service status on mount
  useEffect(() => {
    (async () => {
      try {
        const [histRes, statusRes] = await Promise.allSettled([
          api.get('/ai/center/history?limit=100'),
          api.get('/ai/center/status'),
        ]);
        if (histRes.status === 'fulfilled')   setMessages(histRes.value.data.data || []);
        if (statusRes.status === 'fulfilled') setSvcStatus(statusRes.value.data.data);
      } catch {
        // silently ignore
      } finally {
        setFetching(false);
      }
    })();
  }, []);

  // Load logs/agents when tab changes
  useEffect(() => {
    if (tab === 'logs' && logs.length === 0) {
      setLogsLoading(true);
      api.get('/ai/center/logs?limit=60')
        .then((r) => setLogs(r.data.data || []))
        .catch(() => {})
        .finally(() => setLogsLoading(false));
    }
    if (tab === 'agents' && agents.length === 0) {
      setAgLoading(true);
      api.get('/ai/center/agents')
        .then((r) => setAgents(r.data.data || []))
        .catch(() => {})
        .finally(() => setAgLoading(false));
    }
  }, [tab]); // eslint-disable-line

  // Refresh logs after chat response
  const refreshLogs = useCallback(() => {
    api.get('/ai/center/logs?limit=60')
      .then((r) => setLogs(r.data.data || []))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom when new message arrives
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    setError(null);

    // Optimistic user message
    const tempUser = { id: `u-${Date.now()}`, role: 'user', content: msg, ts: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUser]);
    setLoading(true);

    try {
      const { data } = await api.post('/ai/center/chat', { message: msg });
      const { response, intent, context, raw, n8n: n8nRes } = data.data;

      if (context) setLastCtx(context);

      // Replace temp message + add assistant response (both already saved in DB, but we update locally)
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUser.id);
        return [
          ...filtered,
          { ...tempUser, role: 'user', content: msg },
          {
            id:         `a-${Date.now()}`,
            role:       'assistant',
            content:    response,
            intent,
            ts:         new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ];
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao conectar com a IA. Tente novamente.');
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
      refreshLogs();
    }
  }, [input, loading, refreshLogs]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Apagar todo o histórico de conversa?')) return;
    try {
      await api.delete('/ai/center/history');
      setMessages([]);
      setLastCtx(null);
    } catch {
      // ignore
    }
  };

  const isEmpty = !fetching && messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-gray-950">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-gray-900/50 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
            ⚡
          </div>
          <div>
            <h1 className="font-black text-white text-base leading-tight">IA ZapFome</h1>
            <p className="text-[11px] text-gray-500">Assistente do restaurante</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          {[
            { id: 'chat',   icon: '💬', label: 'Chat' },
            { id: 'logs',   icon: '🔍', label: 'Logs' },
            { id: 'agents', icon: '🤖', label: 'Agentes' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition font-medium
                ${tab === t.id
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
                }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
          {tab === 'chat' && messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-[11px] text-gray-500 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-500/10"
              title="Limpar histórico"
            >
              🗑️
            </button>
          )}
          {tab === 'logs' && (
            <button
              onClick={() => { setLogsLoading(true); api.get('/ai/center/logs?limit=60').then((r) => setLogs(r.data.data||[])).catch(()=>{}).finally(()=>setLogsLoading(false)); }}
              className="text-[11px] text-gray-500 hover:text-blue-400 transition px-2 py-1 rounded-lg hover:bg-blue-500/10"
              title="Atualizar logs"
            >
              🔄
            </button>
          )}
        </div>
      </div>

      {/* ── Webhook status bar ─────────────────────────────────── */}
      <WebhookStatusBar status={svcStatus} />

      {/* ── Context bar ────────────────────────────────────────── */}
      {lastCtx && <ContextBar context={lastCtx} />}

      {/* ── Content area ─────────────────────────────────────────── */}
      {tab === 'logs' ? (
        <LogsPanel logs={logs} loading={logsLoading} />
      ) : tab === 'agents' ? (
        <AgentsPanel agents={agents} loading={agLoading} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {fetching ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : isEmpty ? (
            <WelcomeScreen onQuickAction={(msg) => sendMessage(msg)} />
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id || msg.created_at} msg={msg} />
              ))}
              {loading && (
                <div className="flex justify-start mb-3 gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-sm shrink-0 mt-1">
                    ⚡
                  </div>
                  <div className="bg-gray-800 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
                    <TypingDots />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────── */}
      {tab === 'chat' && error && (
        <div className="mx-4 mb-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Quick actions (when chat has messages) ──────────────── */}
      {tab === 'chat' && !isEmpty && !fetching && (
        <div className="px-4 pb-2 overflow-x-auto flex gap-2 shrink-0">
          {QUICK_ACTIONS.slice(0, 4).map((a) => (
            <button
              key={a.label}
              onClick={() => sendMessage(a.msg)}
              disabled={loading}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-white/5 hover:border-orange-500/30 text-xs text-gray-400 hover:text-white transition-all disabled:opacity-40"
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Input (chat only) ──────────────────────────────────── */}
      {tab === 'chat' && <div className="px-4 pb-4 shrink-0">
        <div className="flex items-end gap-2 bg-gray-800 border border-white/8 rounded-2xl px-4 py-3 focus-within:border-orange-500/50 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Pergunte sobre vendas, peça um post, analise o desempenho..."
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-600 resize-none focus:outline-none max-h-32 min-h-[24px]"
            rows={1}
            disabled={loading}
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 text-white flex items-center justify-center transition-all active:scale-95 shrink-0"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-700 mt-2">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>}
    </div>
  );
}
