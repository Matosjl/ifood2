#!/usr/bin/env node
'use strict';
/**
 * ZapFome Commander — Webhook WhatsApp + MCP Server
 * Recebe comandos do WhatsApp e os executa na VPS.
 * Também expõe ferramentas MCP para Claude.ai no celular.
 *
 * Porta 3002 (http)  — webhook + MCP
 * Rota /webhook      — Evolution API webhook
 * Rota /mcp          — MCP Server (Claude.ai)
 * Rota /status       — health check
 */

const http  = require('http');
const { execSync } = require('child_process');
const fs    = require('fs');
const path  = require('path');

// ── Config ────────────────────────────────────────────────────
const CFG = {
  PORT:           Number(process.env.COMMANDER_PORT) || 3002,
  EVOLUTION_URL:  process.env.EVOLUTION_URL || 'http://172.19.0.1:8080',
  EVOLUTION_KEY:  process.env.EVOLUTION_KEY || 'zapfome2024secretkey',
  WA_INSTANCE:    process.env.WA_INSTANCE   || 'zt_e3da3ef94d5c4a6798c1',
  OWNER_PHONE:    process.env.OWNER_PHONE   || '5511999999999',
  MCP_TOKEN:      process.env.MCP_TOKEN     || 'zapfome-mcp-secret-2024',
  KNOWLEDGE_FILE: path.join(__dirname, 'knowledge.json'),
};

// ── Helpers ───────────────────────────────────────────────────
function run(cmd, timeout = 15000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return (e.stderr || e.message || 'error').toString().trim();
  }
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── WhatsApp ──────────────────────────────────────────────────
async function sendWA(phone, text) {
  try {
    await fetch(`${CFG.EVOLUTION_URL}/message/sendText/${CFG.WA_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.EVOLUTION_KEY },
      body: JSON.stringify({ number: phone, text }),
    });
  } catch (e) {
    log('WA send error: ' + e.message);
  }
}

// ── Knowledge ─────────────────────────────────────────────────
function loadKB() {
  try { return JSON.parse(fs.readFileSync(CFG.KNOWLEDGE_FILE, 'utf8')); }
  catch { return { problems: [] }; }
}

// ── Command handlers ──────────────────────────────────────────
const COMMANDS = {

  status: () => {
    const containers = run('docker ps -a --format "{{.Names}} | {{.Status}}"');
    const disk  = run("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\" usado)\"}'");
    const mem   = run("free -m | awk '/Mem:/{print $3\"MB /\"$2\"MB\"}'");
    const load  = run("uptime | awk -F'load average:' '{print $2}'").trim();
    return `📊 *Status ZapFome*\n\n*Containers:*\n${containers}\n\n💾 Disco: ${disk}\n🧠 RAM: ${mem}\n⚡ Load:${load}`;
  },

  logs: (args) => {
    const service = args[0] || 'saas_backend';
    const validServices = ['saas_backend', 'saas_nginx', 'saas_postgres', 'saas_worker', 'saas_frontend'];
    const name = validServices.includes(service) ? service : 'saas_backend';
    const logs = run(`docker logs ${name} --tail 30 2>&1`);
    return `📋 *Logs ${name}:*\n\`\`\`\n${logs.slice(-1500)}\n\`\`\``;
  },

  restart: (args) => {
    const service = args[0] || 'saas_backend';
    const allowed = ['saas_backend', 'saas_worker', 'saas_frontend', 'saas_nginx'];
    if (!allowed.includes(service)) return `❌ Serviço inválido. Use: ${allowed.join(', ')}`;
    const out = run(`docker restart ${service}`);
    return `🔄 *Reiniciando ${service}...*\n${out}`;
  },

  'fix nginx': () => {
    const out1 = run("cd /opt/saas-restaurant && export DOMAIN=zapfome.ddns.net && envsubst '${DOMAIN}' < nginx/templates/app-ssl.conf > nginx/conf.d/app.conf");
    const out2 = run('docker exec saas_nginx nginx -s reload');
    return `🔧 *Fix nginx HTTPS aplicado*\n${out2.includes('signal') ? '✅ Nginx recarregado' : out2}`;
  },

  health: () => {
    const httpsCheck = run('curl -sk --max-time 8 https://zapfome.ddns.net/ -o /dev/null -w "%{http_code}"');
    const backendCheck = run('docker exec saas_backend wget -qO- http://localhost:3000/health 2>/dev/null | head -c 200 || echo "não responde"');
    const dbCheck = run("docker exec saas_postgres psql -U saas_user -d saas_restaurant -c '\\q' 2>&1 || echo 'erro'");
    return (
      `🏥 *Health Check*\n\n` +
      `🌐 HTTPS: ${httpsCheck === '200' ? '✅ OK' : `❌ ${httpsCheck}`}\n` +
      `⚙️ Backend: ${backendCheck.includes('{') ? '✅ OK' : '❌ ' + backendCheck.slice(0,100)}\n` +
      `🗄️ Postgres: ${dbCheck.trim() === '' ? '✅ OK' : '❌ ' + dbCheck.slice(0,100)}`
    );
  },

  diagnose: () => {
    const containers  = run('docker ps -a --format "{{.Names}} | {{.Status}}"');
    const backendLogs = run('docker logs saas_backend --tail 25 2>&1');
    const nginxLogs   = run('docker logs saas_nginx --tail 10 2>&1');
    const disk        = run("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\")'");
    const mem         = run("free -m | awk '/Mem:/{printf \"%dMB / %dMB\", $3, $2}'");
    const load        = run("uptime | awk -F'load average:' '{print $2}'").trim();
    const errors      = run("docker logs saas_backend --tail 50 2>&1 | grep -iE 'error|fatal|crash|SIGTERM|SIGKILL' | tail -8");
    const httpsCode   = run('curl -sk --max-time 6 https://zapfome.ddns.net/ -o /dev/null -w "%{http_code}"');

    const httpsStatus = httpsCode === '200' ? '✅ OK (200)' : `❌ ${httpsCode || 'timeout'}`;
    const errSection  = errors.trim() ? errors.trim().slice(0, 500) : '✅ Nenhum erro crítico';

    return (
      `🔍 *Diagnóstico Completo ZapFome*\n\n` +
      `📦 *Containers:*\n${containers}\n\n` +
      `🌐 HTTPS: ${httpsStatus}\n` +
      `💾 Disco: ${disk}\n` +
      `🧠 RAM: ${mem}\n` +
      `⚡ Load:${load}\n\n` +
      `⚠️ *Erros recentes (backend):*\n${errSection}\n\n` +
      `📋 *Backend logs:*\n\`\`\`${backendLogs.slice(-800)}\`\`\`\n\n` +
      `📋 *Nginx logs:*\n\`\`\`${nginxLogs.slice(-300)}\`\`\`\n\n` +
      `💡 Copie este relatório e cole no Claude Code para análise detalhada.`
    );
  },

  kb: () => {
    const kb = loadKB();
    if (!kb.problems.length) return '📚 Base de conhecimento vazia.';
    const list = kb.problems
      .filter(p => p.active !== false)
      .map((p, i) => `${i + 1}. *${p.pattern}* — ${p.solution} (✅${p.success_count}x)`)
      .join('\n');
    return `📚 *Base de Conhecimento*\n\n${list}`;
  },

  ajuda: () => (
    `🛡️ *ZapFome Vigia — Comandos*\n\n` +
    `• *status* — containers + recursos\n` +
    `• *health* — health check completo\n` +
    `• *logs backend* — logs do backend\n` +
    `• *logs nginx* — logs do nginx\n` +
    `• *restart backend* — reiniciar backend\n` +
    `• *restart nginx* — reiniciar nginx\n` +
    `• *fix nginx* — reconfigurar HTTPS\n` +
    `• *diagnose* — relatório completo para colar no Claude\n` +
    `• *kb* — ver base de conhecimento\n` +
    `• *ajuda* — este menu`
  ),
};

// Emojis que iniciam respostas do próprio bot — ignorar para evitar loop
const BOT_EMOJI_PREFIX = ['📊','🚨','✅','❌','🔍','🏥','🛡️','⚠️','📋','🔧','🔄','🤖','📱','💾','🧠','⚡','🌐','🗄️','🔁','📈','🎉','🚀'];

// Normaliza número BR: remove o 9 extra em números de celular (55519XXXXXXXX → 5551XXXXXXXX)
function normPhone(raw) {
  const d = raw.replace(/\D/g, '');
  // 13 dígitos: 55 + 2 área + 9 + 8 número → remove o 9
  if (d.length === 13 && d.startsWith('55') && d[4] === '9')
    return d.slice(0, 4) + d.slice(5);
  return d;
}

function isOwnerPhone(phone) {
  const a = normPhone(phone);
  const b = normPhone(CFG.OWNER_PHONE);
  return a === b || a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
}

// ── Process WhatsApp message ──────────────────────────────────
async function handleWAMessage(senderPhone, text, fromMe = false) {
  // Aceita: mensagem DO dono (incoming) OU automensagem (fromMe + próprio número)
  if (!isOwnerPhone(senderPhone)) {
    log(`Ignorado (não é dono): ${senderPhone}`);
    return;
  }

  // Ignora mensagens enviadas pelo próprio bot (evita loop infinito)
  // Mensagens do bot começam com emojis de status
  if (BOT_EMOJI_PREFIX.some(e => text.startsWith(e))) {
    log(`Ignorando resposta do bot: "${text.slice(0, 60)}"`);
    return;
  }

  const input = text.trim().toLowerCase();
  log(`Comando recebido: "${input}" (fromMe=${fromMe})`);

  // Match command
  let handler = null;
  let args    = [];

  for (const [key, fn] of Object.entries(COMMANDS)) {
    if (input.startsWith(key)) {
      handler = fn;
      args = input.slice(key.length).trim().split(/\s+/).filter(Boolean);
      break;
    }
  }

  if (!handler) {
    await sendWA(CFG.OWNER_PHONE, COMMANDS.ajuda());
    return;
  }

  try {
    const result = await handler(args);
    if (result) await sendWA(CFG.OWNER_PHONE, result);
  } catch (e) {
    await sendWA(CFG.OWNER_PHONE, `❌ Erro ao executar comando: ${e.message}`);
  }
}

// ── MCP Tools ─────────────────────────────────────────────────
const MCP_TOOLS = [
  {
    name: 'get_status',
    description: 'Retorna status dos containers Docker, CPU, memória e disco',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_logs',
    description: 'Lê logs de um container',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['saas_backend', 'saas_nginx', 'saas_postgres', 'saas_worker', 'saas_frontend'] },
        lines:   { type: 'number', default: 50 },
      },
      required: ['service'],
    },
  },
  {
    name: 'restart_service',
    description: 'Reinicia um container Docker',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['saas_backend', 'saas_nginx', 'saas_worker', 'saas_frontend'] },
      },
      required: ['service'],
    },
  },
  {
    name: 'run_command',
    description: 'Executa um comando shell na VPS (use com cuidado)',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
  {
    name: 'fix_nginx_https',
    description: 'Regenera configuração HTTPS do nginx e recarrega',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_knowledge_base',
    description: 'Retorna a base de conhecimento de problemas e soluções conhecidas',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_solution',
    description: 'Salva uma solução na base de conhecimento para uso futuro',
    inputSchema: {
      type: 'object',
      properties: {
        pattern:  { type: 'string', description: 'Palavra-chave que identifica o problema' },
        solution: { type: 'string', description: 'Descrição da solução' },
        commands: { type: 'array', items: { type: 'string' }, description: 'Comandos para aplicar a solução' },
      },
      required: ['pattern', 'solution', 'commands'],
    },
  },
  {
    name: 'health_check',
    description: 'Verifica saúde do HTTPS, backend e banco de dados',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function executeMcpTool(name, input) {
  switch (name) {
    case 'get_status':
      return COMMANDS.status();

    case 'get_logs': {
      const svc   = input.service || 'saas_backend';
      const lines = Number(input.lines) || 50;
      return run(`docker logs ${svc} --tail ${lines} 2>&1`);
    }

    case 'restart_service': {
      const out = run(`docker restart ${input.service}`);
      return `Reiniciado: ${input.service}\n${out}`;
    }

    case 'run_command':
      return run(input.command);

    case 'fix_nginx_https':
      return COMMANDS['fix nginx']();

    case 'get_knowledge_base': {
      const kb = loadKB();
      return JSON.stringify(kb, null, 2);
    }

    case 'save_solution': {
      const kb = loadKB();
      const existing = kb.problems.findIndex(p => p.pattern === input.pattern);
      const entry = {
        pattern:       input.pattern,
        solution:      input.solution,
        commands:      input.commands,
        success_count: 0,
        fail_count:    0,
        first_seen:    new Date().toISOString(),
        last_seen:     new Date().toISOString(),
        active:        true,
      };
      if (existing >= 0) kb.problems[existing] = { ...kb.problems[existing], ...entry };
      else kb.problems.push(entry);
      kb.last_updated = new Date().toISOString();
      fs.writeFileSync(CFG.KNOWLEDGE_FILE, JSON.stringify(kb, null, 2));
      return `Solução "${input.pattern}" salva na base de conhecimento.`;
    }

    case 'health_check':
      return await COMMANDS.health();

    default:
      return `Tool desconhecida: ${name}`;
  }
}

// ── HTTP Server ───────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  typeof body === 'string' ? 'text/plain' : 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { send(res, 204, ''); return; }

  const url = req.url.split('?')[0];

  // ── Health ────────────────────────────────────────────────
  if (url === '/status') {
    send(res, 200, { ok: true, uptime: process.uptime() });
    return;
  }

  // ── WhatsApp Webhook (Evolution API) ──────────────────────
  if (url === '/webhook' && req.method === 'POST') {
    const raw  = await readBody(req);
    send(res, 200, 'ok');
    try {
      const payload = JSON.parse(raw);
      // Evolution API webhook payload
      const data   = payload?.data || payload;
      const msg    = data?.message?.conversation ||
                     data?.message?.extendedTextMessage?.text ||
                     payload?.message?.conversation || '';
      const from   = data?.key?.remoteJid || payload?.sender || '';
      const fromMe = data?.key?.fromMe ?? false;

      if (msg && from) {
        log(`Webhook WA: from=${from} fromMe=${fromMe} msg="${msg.slice(0, 80)}"`);
        // Para auto-mensagem: remoteJid é o próprio número, fromMe=true
        handleWAMessage(from, msg, fromMe).catch(e => log('WA handler error: ' + e.message));
      }
    } catch (e) {
      log('Webhook parse error: ' + e.message);
    }
    return;
  }

  // ── MCP Server ────────────────────────────────────────────
  if (url === '/mcp') {
    // Auth check
    const auth = req.headers['authorization'] || '';
    if (!auth.includes(CFG.MCP_TOKEN)) {
      send(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      // SSE stream for MCP initialize
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: {"jsonrpc":"2.0","method":"ping"}\n\n');
      // Keep alive
      const ping = setInterval(() => res.write(': ping\n\n'), 30000);
      req.on('close', () => clearInterval(ping));
      return;
    }

    if (req.method === 'POST') {
      const raw = await readBody(req);
      let rpc;
      try { rpc = JSON.parse(raw); }
      catch { send(res, 400, { error: 'Invalid JSON' }); return; }

      const { method, params, id } = rpc;
      log(`MCP: ${method} id=${id}`);

      try {
        let result;

        if (method === 'initialize') {
          result = {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'zapfome-vigia', version: '1.0.0' },
            capabilities: { tools: {} },
          };
        } else if (method === 'tools/list') {
          result = { tools: MCP_TOOLS };
        } else if (method === 'tools/call') {
          const toolName = params?.name;
          const toolInput = params?.arguments || {};
          const output = await executeMcpTool(toolName, toolInput);
          result = { content: [{ type: 'text', text: String(output) }] };
        } else if (method === 'notifications/initialized' || method === 'ping') {
          send(res, 200, { jsonrpc: '2.0', id, result: {} });
          return;
        } else {
          send(res, 200, { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
          return;
        }

        send(res, 200, { jsonrpc: '2.0', id, result });
      } catch (e) {
        send(res, 200, { jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
      }
      return;
    }
  }

  send(res, 404, 'Not found');
});

server.listen(CFG.PORT, () => {
  log(`🚀 Commander rodando na porta ${CFG.PORT}`);
  log(`   Webhook: http://localhost:${CFG.PORT}/webhook`);
  log(`   MCP:     https://zapfome.ddns.net/mcp`);
  log(`   Token:   ${CFG.MCP_TOKEN}`);
});
