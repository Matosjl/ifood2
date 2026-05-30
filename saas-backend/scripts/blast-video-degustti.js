#!/usr/bin/env node
'use strict';
/**
 * blast-video-degustti.js
 *
 * Envia vídeo via WhatsApp para os N contatos mais recentes
 * buscados diretamente da Evolution API (conversas recentes).
 *
 * Uso (no VPS dentro do container):
 *   node scripts/blast-video-degustti.js /caminho/do/video.mp4
 *
 * Flags opcionais:
 *   --limit=160      número máximo de contatos (padrão: 160)
 *   --delay=5000     ms entre cada envio (padrão: 5000 = 5s)
 *   --dry-run        lista os contatos SEM enviar nada
 *
 * Exemplos:
 *   node scripts/blast-video-degustti.js /tmp/promo.mp4
 *   node scripts/blast-video-degustti.js /tmp/promo.mp4 --limit=10 --dry-run
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');

// ── Caption ───────────────────────────────────────────────────

const CAPTION = `🚨 DOMINGO DE LOUCURA NA DEGUSTTI! 🚨

🔥 PROMOÇÃO ÚNICA E IMPERDÍVEL! 🔥

Hoje é o dia de deixar o almoço por nossa conta e economizar de verdade!

🍽️ Marmitas fresquinhas, sabor caseiro e aquele tempero que conquista na primeira garfada.

🚚 TELE ENTREGA 100% GRATUITA
💸 Você não paga absolutamente NADA pela entrega!
⏰ Oferta válida somente neste domingo.

✅ Mais comida
✅ Mais economia
✅ Mais praticidade
✅ Entrega grátis

📲 Peça agora pelo WhatsApp e garanta o seu almoço antes que a promoção termine!

DOMINGO COM ENTREGA GRÁTIS É SÓ NA DEGUSTTI!
🔥 Aproveite enquanto está valendo! 🔥`;

// ── Args ──────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const videoPath = args.find(a => !a.startsWith('--'));
const limit     = parseInt((args.find(a => a.startsWith('--limit='))  || '--limit=160').split('=')[1]);
const delay     = parseInt((args.find(a => a.startsWith('--delay='))  || '--delay=5000').split('=')[1]);
const dryRun    = args.includes('--dry-run');

if (!videoPath) {
  console.error('❌ Informe o caminho do vídeo: node scripts/blast-video-degustti.js /caminho/video.mp4');
  process.exit(1);
}
if (!fs.existsSync(videoPath)) {
  console.error(`❌ Arquivo não encontrado: ${videoPath}`);
  process.exit(1);
}

// ── DB (só para pegar a instância WhatsApp da Degustti) ───────

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📣 BLAST DE VÍDEO — DEGUSTTI');
  console.log('  📱 Fonte: conversas recentes da Evolution API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (dryRun) console.log('  ⚠️  DRY-RUN: nenhum envio será feito');
  console.log('');

  // 1. Busca instância WhatsApp da Degustti no DB
  const { rows: tenants } = await db.query(
    `SELECT id, name, whatsapp_instance
     FROM tenants
     WHERE LOWER(name) LIKE '%degustti%' AND status = 'active'
     LIMIT 1`
  );
  await db.end();

  if (!tenants[0]) {
    console.error('❌ Tenant Degustti não encontrado ou inativo.');
    process.exit(1);
  }
  const tenant = tenants[0];
  const instance = tenant.whatsapp_instance;

  console.log(`✅ Tenant   : ${tenant.name}`);
  console.log(`📱 Instância: ${instance || '⚠️ NÃO CONFIGURADA'}`);
  if (!instance) {
    console.error('❌ Sem instância WhatsApp configurada para a Degustti.');
    process.exit(1);
  }

  // 2. Busca conversas recentes na Evolution API
  const evo = axios.create({
    baseURL: process.env.EVOLUTION_API_URL,
    headers: { apikey: process.env.EVOLUTION_API_KEY },
    timeout: 30000,
  });

  console.log('🔍 Buscando conversas recentes na Evolution API...');
  let chats = [];
  try {
    const resp = await evo.get(`/chat/findChats/${instance}`);
    chats = Array.isArray(resp.data) ? resp.data : (resp.data?.chats || []);
  } catch (err) {
    console.error('❌ Erro ao buscar chats:', err.response?.data || err.message);
    process.exit(1);
  }

  // 3. Filtra: somente números individuais (não grupos), com telefone válido
  const contacts = chats
    .filter(c => {
      const id = c.id || c.remoteJid || '';
      // Pula grupos (@g.us) e status broadcast
      if (id.includes('@g.us') || id.includes('status@broadcast')) return false;
      // Extrai só dígitos do número
      const digits = id.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      // Precisa ter pelo menos 12 dígitos (55 + DDD + número)
      return digits.length >= 12;
    })
    .sort((a, b) => {
      // Ordena por mais recente (updatedAt ou lastMessageTimestamp)
      const ta = a.updatedAt || a.lastMessageTimestamp || 0;
      const tb = b.updatedAt || b.lastMessageTimestamp || 0;
      return tb - ta;
    })
    .slice(0, limit)
    .map(c => {
      const id     = c.id || c.remoteJid || '';
      const number = id.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      const name   = c.name || c.pushName || c.verifiedName || number;
      return { number, name };
    });

  console.log(`👥 Contatos encontrados: ${contacts.length} (de ${chats.length} conversas totais)`);
  console.log(`⏱️  Delay entre envios  : ${delay / 1000}s`);
  console.log(`🎬 Vídeo: ${videoPath} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log('');

  if (contacts.length === 0) {
    console.error('❌ Nenhum contato individual encontrado nas conversas.');
    process.exit(1);
  }

  // 4. Dry-run: só lista
  if (dryRun) {
    console.log('📋 Lista de contatos (dry-run):');
    contacts.forEach((c, i) =>
      console.log(`  ${String(i + 1).padStart(3)}. ${c.name.padEnd(30)} ${c.number}`)
    );
    console.log('');
    console.log('✅ Dry-run concluído. Remova --dry-run para enviar de verdade.');
    return;
  }

  // 5. Lê vídeo como base64
  console.log('📦 Lendo vídeo...');
  const base64Video = fs.readFileSync(videoPath).toString('base64');
  console.log(`✅ Base64 pronto (${(base64Video.length / 1024).toFixed(0)} KB)`);
  console.log('');
  console.log('🚀 Iniciando envios...');
  console.log('');

  let sent = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < contacts.length; i++) {
    const { number, name } = contacts[i];
    const tag = `[${String(i + 1).padStart(3)}/${contacts.length}]`;

    try {
      await evo.post(`/message/sendMedia/${instance}`, {
        number,
        mediatype: 'video',
        media:     base64Video,
        caption:   CAPTION,
      });
      sent++;
      console.log(`  ${tag} ✅ ENVIADO  ${name} (${number})`);
    } catch (err) {
      failed++;
      const msg = err.response?.data?.message || err.message || 'erro desconhecido';
      console.log(`  ${tag} ❌ FALHOU   ${name} (${number}) — ${msg}`);
      errors.push({ name, number, error: msg });
    }

    if (i < contacts.length - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // 6. Relatório final
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📊 RELATÓRIO FINAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Enviados : ${sent}`);
  console.log(`  ❌ Falhas   : ${failed}`);
  console.log(`  📱 Total    : ${contacts.length}`);
  if (errors.length > 0) {
    console.log('');
    console.log('  Falhas detalhadas:');
    errors.forEach(e => console.log(`    • ${e.name} (${e.number}): ${e.error}`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
