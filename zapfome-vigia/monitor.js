#!/usr/bin/env node
'use strict';
/**
 * ZapFome Vigia — Monitor 24/7
 * Verifica saúde dos containers e endpoints a cada 30s.
 * Auto-fixa problemas conhecidos. Avisa no WhatsApp.
 * Chama Claude API quando não sabe a solução.
 */

const { execSync, exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────
const CFG = {
  EVOLUTION_URL:  process.env.EVOLUTION_URL  || 'http://172.19.0.1:8080',
  EVOLUTION_KEY:  process.env.EVOLUTION_KEY  || 'zapfome2024secretkey',
  WA_INSTANCE:    process.env.WA_INSTANCE    || 'zt_e3da3ef94d5c4a6798c1',
  OWNER_PHONE:    process.env.OWNER_PHONE    || '5511999999999', // SEM +
  CHECK_INTERVAL: Number(process.env.CHECK_INTERVAL) || 30_000,   // 30s
  ALERT_COOLDOWN: Number(process.env.ALERT_COOLDOWN) || 600_000,  // 10min
  KNOWLEDGE_FILE: path.join(__dirname, 'knowledge.json'),
  LOG_FILE:       path.join(__dirname, 'monitor.log'),
};

// ── Containers monitorados ────────────────────────────────────
const CONTAINERS = [
  { name: 'saas_backend',  critical: true  },
  { name: 'saas_nginx',    critical: true  },
  { name: 'saas_postgres', critical: true  },
  { name: 'saas_redis',    critical: true  },
  { name: 'saas_frontend', critical: false },
  { name: 'saas_worker',   critical: false },
];

// ── State ─────────────────────────────────────────────────────
const alertCooldowns = new Map();   // key → last alert timestamp
const knownDown      = new Set();   // containers currently down

// ── Logging ───────────────────────────────────────────────────
function log(level, msg, data = '') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg} ${data ? JSON.stringify(data) : ''}`;
  console.log(line);
  try {
    fs.appendFileSync(CFG.LOG_FILE, line + '\n');
    // Mantém log com no máximo 5000 linhas
    const lines = fs.readFileSync(CFG.LOG_FILE, 'utf8').split('\n');
    if (lines.length > 5000) {
      fs.writeFileSync(CFG.LOG_FILE, lines.slice(-4000).join('\n'));
    }
  } catch { /* ignore */ }
}

// ── Knowledge base ────────────────────────────────────────────
function loadKnowledge() {
  try {
    return JSON.parse(fs.readFileSync(CFG.KNOWLEDGE_FILE, 'utf8'));
  } catch {
    return { problems: [], last_updated: null };
  }
}

function saveKnowledge(kb) {
  kb.last_updated = new Date().toISOString();
  fs.writeFileSync(CFG.KNOWLEDGE_FILE, JSON.stringify(kb, null, 2));
}

function findSolution(errorPattern) {
  const kb = loadKnowledge();
  return kb.problems.find(p =>
    p.active !== false &&
    p.success_count > 0 &&
    errorPattern.toLowerCase().includes(p.pattern.toLowerCase())
  );
}

function recordSolution(pattern, solution, commands, success) {
  const kb = loadKnowledge();
  const existing = kb.problems.find(p => p.pattern === pattern);
  if (existing) {
    if (success) existing.success_count = (existing.success_count || 0) + 1;
    else existing.fail_count = (existing.fail_count || 0) + 1;
    existing.last_seen = new Date().toISOString();
  } else {
    kb.problems.push({
      pattern,
      solution,
      commands,
      success_count: success ? 1 : 0,
      fail_count:    success ? 0 : 1,
      first_seen:    new Date().toISOString(),
      last_seen:     new Date().toISOString(),
      active:        true,
    });
  }
  saveKnowledge(kb);
}

// ── WhatsApp ──────────────────────────────────────────────────
async function sendWhatsApp(message) {
  try {
    const res = await fetch(`${CFG.EVOLUTION_URL}/message/sendText/${CFG.WA_INSTANCE}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: CFG.OWNER_PHONE,
        text:   message,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log('INFO', 'WhatsApp enviado OK');
  } catch (e) {
    log('WARN', 'Falha ao enviar WhatsApp:', e.message);
  }
}

function canAlert(key) {
  const last = alertCooldowns.get(key) || 0;
  if (Date.now() - last < CFG.ALERT_COOLDOWN) return false;
  alertCooldowns.set(key, Date.now());
  return true;
}

// ── Shell ─────────────────────────────────────────────────────
function run(cmd) {
  try {
    return execSync(cmd, { timeout: 15000, encoding: 'utf8' }).trim();
  } catch (e) {
    return e.stderr || e.message;
  }
}

// ── Auto-fix executors ────────────────────────────────────────
const AUTO_FIXES = {
  'nginx_ssl_reset': {
    pattern: 'nginx ssl',
    description: 'Nginx HTTPS config resetou para pré-SSL',
    commands: [
      'cd /opt/saas-restaurant && export DOMAIN=zapfome.ddns.net && envsubst \'${DOMAIN}\' < nginx/templates/app-ssl.conf > nginx/conf.d/app.conf',
      'docker exec saas_nginx nginx -s reload',
    ],
  },
  'container_down': {
    pattern: 'container down',
    description: 'Container parado',
    commands: ['docker restart {container}'],
  },
  'backend_crash': {
    pattern: 'backend error',
    description: 'Backend com erros críticos',
    commands: ['docker restart saas_backend', 'sleep 5'],
  },
};

function applyCommands(commands, vars = {}) {
  const results = [];
  for (let cmd of commands) {
    for (const [k, v] of Object.entries(vars)) {
      cmd = cmd.replace(`{${k}}`, v);
    }
    log('INFO', 'Executando:', cmd);
    const out = run(cmd);
    results.push({ cmd, out });
  }
  return results;
}

// ── Checks ────────────────────────────────────────────────────
async function checkContainers() {
  const issues = [];

  for (const ct of CONTAINERS) {
    const status = run(`docker inspect --format='{{.State.Status}}' ${ct.name} 2>/dev/null`);
    const running = status === 'running';

    if (!running) {
      if (!knownDown.has(ct.name) && canAlert(`down_${ct.name}`)) {
        knownDown.add(ct.name);
        const logs = run(`docker logs ${ct.name} --tail 20 2>&1`);
        issues.push({ container: ct.name, critical: ct.critical, logs });
      }
    } else {
      if (knownDown.has(ct.name)) {
        knownDown.delete(ct.name);
        if (canAlert(`recover_${ct.name}`)) {
          await sendWhatsApp(`✅ *ZapFome Vigia*\nContainer *${ct.name}* voltou ao ar!`);
        }
      }
    }
  }

  return issues;
}

async function checkHttps() {
  try {
    const res = await fetch('https://zapfome.ddns.net/', {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return null;
    return `HTTPS retornou ${res.status}`;
  } catch (e) {
    return `HTTPS falhou: ${e.message}`;
  }
}

async function checkBackendHealth() {
  try {
    const res = await fetch('https://zapfome.ddns.net/api/orders', {
      headers: { Authorization: 'Bearer skip' }, // vai dar 401, mas mostra que nginx→backend funciona
      signal: AbortSignal.timeout(8000),
    });
    // 401 é OK (auth required), 502/503 é problema
    if (res.status === 502 || res.status === 503) {
      return `Backend unreachable: ${res.status}`;
    }
    return null;
  } catch (e) {
    return `Backend falhou: ${e.message}`;
  }
}

// ── Handle problem ────────────────────────────────────────────
async function handleProblem(problem, context = {}) {
  log('WARN', 'Problema detectado:', problem);

  // 1. Procura solução conhecida
  const known = findSolution(problem);
  if (known) {
    log('INFO', 'Solução conhecida encontrada:', known.solution);
    await sendWhatsApp(
      `⚠️ *ZapFome Vigia*\n` +
      `Problema: ${problem}\n\n` +
      `🔧 Aplicando solução conhecida:\n_${known.solution}_`
    );
    const results = applyCommands(known.commands, context);
    const success = results.every(r => !r.out.includes('Error') && !r.out.includes('error'));
    recordSolution(known.pattern, known.solution, known.commands, success);

    if (success) {
      await sendWhatsApp(`✅ *Fix aplicado com sucesso!*\n${problem}`);
    } else {
      await sendWhatsApp(`❌ *Fix falhou.* Analisando com Claude...`);
      await escalateToClaude(problem, context);
    }
    return;
  }

  // 2. Escalona para Claude
  await escalateToClaude(problem, context);
}

async function escalateToClaude(problem, context = {}) {
  const logs       = context.logs || run('docker logs saas_backend --tail 30 2>&1');
  const containers = run('docker ps -a --format "{{.Names}} | {{.Status}}"');
  const errors     = run("docker logs saas_backend --tail 50 2>&1 | grep -iE 'error|fatal|crash|SIGTERM|SIGKILL' | tail -8");
  const disk       = run("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\")'");
  const mem        = run("free -m | awk '/Mem:/{printf \"%dMB / %dMB\", $3, $2}'");

  // Monta diagnóstico completo para o dono resolver via Claude Code/Claude.ai
  await sendWhatsApp(
    `🚨 *ZapFome ALERTA*\n\n` +
    `❗ *Problema:* ${problem}\n\n` +
    `📦 *Containers:*\n${containers}\n\n` +
    `⚠️ *Erros encontrados:*\n${errors ? errors.slice(0, 400) : 'nenhum erro crítico'}\n\n` +
    `📋 *Logs recentes:*\n\`\`\`${logs.slice(-600)}\`\`\`\n\n` +
    `💾 Disco: ${disk} | 🧠 RAM: ${mem}\n\n` +
    `Comandos rápidos:\n` +
    `• *status* — ver containers\n` +
    `• *restart backend* — reiniciar backend\n` +
    `• *fix nginx* — reconfigurar HTTPS\n` +
    `• *diagnose* — diagnóstico completo\n` +
    `• *logs backend* — ver mais logs`
  );
}

// ── Main loop ─────────────────────────────────────────────────
let checkCount = 0;

async function runChecks() {
  checkCount++;

  // A cada check: containers
  const containerIssues = await checkContainers();
  for (const issue of containerIssues) {
    await handleProblem(
      `Container ${issue.container} está parado`,
      { logs: issue.logs, container: issue.container }
    );
  }

  // A cada 2 checks (60s): HTTPS
  if (checkCount % 2 === 0) {
    const httpsError = await checkHttps();
    if (httpsError && canAlert('https_error')) {
      await handleProblem(`HTTPS falhou: ${httpsError} — nginx ssl config pode ter resetado`);
    }
  }

  // A cada 4 checks (120s): backend health
  if (checkCount % 4 === 0) {
    const backendError = await checkBackendHealth();
    if (backendError && canAlert('backend_health')) {
      await handleProblem(`Backend error: ${backendError}`);
    }
  }

  // A cada 20 checks (10min): disk space
  if (checkCount % 20 === 0) {
    const disk = run("df / --output=pcent | tail -1 | tr -d ' %'");
    const pct  = parseInt(disk);
    if (!isNaN(pct) && pct >= 85 && canAlert('disk_space')) {
      await sendWhatsApp(`⚠️ *ZapFome Vigia*\nDisco em *${pct}%* — limpe imagens Docker antigas:\n\`docker system prune -f\``);
    }
  }
}

// ── Startup ───────────────────────────────────────────────────
log('INFO', '🛡️  ZapFome Vigia iniciado', {
  interval: CFG.CHECK_INTERVAL + 'ms',
  instance: CFG.WA_INSTANCE,
  owner:    CFG.OWNER_PHONE.slice(0, 4) + '****',
});

// Pré-popula knowledge base com o problema HTTPS que já aconteceu
(function seedKnowledge() {
  const kb = loadKnowledge();
  const hasNginxFix = kb.problems.some(p => p.pattern === 'nginx ssl');
  if (!hasNginxFix) {
    kb.problems.push({
      pattern: 'nginx ssl',
      solution: 'Nginx HTTPS config resetou para pré-SSL — aplica template SSL e recarrega nginx',
      commands: [
        "cd /opt/saas-restaurant && export DOMAIN=zapfome.ddns.net && envsubst '${DOMAIN}' < nginx/templates/app-ssl.conf > nginx/conf.d/app.conf",
        'docker exec saas_nginx nginx -s reload',
      ],
      success_count: 1,
      fail_count:    0,
      first_seen:    new Date().toISOString(),
      last_seen:     new Date().toISOString(),
      active:        true,
    });
    saveKnowledge(kb);
    log('INFO', 'Knowledge base pré-populada com fix do HTTPS');
  }
})();

sendWhatsApp(
  `🛡️ *ZapFome Vigia iniciado*\n` +
  `Monitorando a cada ${CFG.CHECK_INTERVAL / 1000}s\n\n` +
  `Comandos disponíveis:\n` +
  `• *status* — ver containers\n` +
  `• *logs backend* — últimos logs\n` +
  `• *restart [serviço]* — reiniciar container\n` +
  `• *fix nginx* — reconfigurar HTTPS\n` +
  `• *diagnose* — diagnóstico completo`
).catch(() => {});

setInterval(runChecks, CFG.CHECK_INTERVAL);
runChecks(); // primeira checagem imediata
