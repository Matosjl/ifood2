#!/usr/bin/env node
'use strict';
/**
 * blast-video-degustti.js
 *
 * Envia vídeo via WhatsApp para os N clientes mais recentes da Degustti.
 *
 * Uso (no VPS dentro do container):
 *   node scripts/blast-video-degustti.js /caminho/do/video.mp4
 *
 * Flags opcionais:
 *   --limit=160      número máximo de clientes (padrão: 160)
 *   --delay=5000     ms entre cada envio (padrão: 5000 = 5s)
 *   --dry-run        mostra a lista de clientes SEM enviar nada
 *
 * Exemplos:
 *   node scripts/blast-video-degustti.js /tmp/promo.mp4
 *   node scripts/blast-video-degustti.js /tmp/promo.mp4 --limit=10 --dry-run
 */

const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');

// ── Config ────────────────────────────────────────────────────

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

📲 Peça agora pelo WhatsApp e garante o seu almoço antes que a promoção termine!

DOMINGO COM ENTREGA GRÁTIS É SÓ NA DEGUSTTI!
🔥 Aproveite enquanto está valendo! 🔥`;

// ── Args ──────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const videoPath = args.find(a => !a.startsWith('--'));
const limit   = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=160').split('=')[1]);
const delay   = parseInt((args.find(a => a.startsWith('--delay=')) || '--delay=5000').split('=')[1]);
const dryRun  = args.includes('--dry-run');

if (!videoPath) {
  console.error('❌ Informe o caminho do vídeo: node scripts/blast-video-degustti.js /caminho/video.mp4');
  process.exit(1);
}
if (!fs.existsSync(videoPath)) {
  console.error(`❌ Arquivo não encontrado: ${videoPath}`);
  process.exit(1);
}

// ── DB ────────────────────────────────────────────────────────

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📣 BLAST DE VÍDEO — DEGUSTTI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (dryRun) console.log('  ⚠️  DRY-RUN: nenhum envio será feito');
  console.log('');

  // 1. Busca tenant Degustti
  const { rows: tenants } = await db.query(
    `SELECT id, name, whatsapp_instance
     FROM tenants
     WHERE LOWER(name) LIKE '%degustti%' AND status = 'active'
     LIMIT 1`
  );
  if (!tenants[0]) {
    console.error('❌ Tenant Degustti não encontrado ou inativo.');
    process.exit(1);
  }
  const tenant = tenants[0];
  console.log(`✅ Tenant: ${tenant.name}`);
  console.log(`📱 Instância WhatsApp: ${tenant.whatsapp_instance || '⚠️ NÃO CONFIGURADA'}`);
  if (!tenant.whatsapp_instance) {
    console.error('❌ Sem instância WhatsApp configurada para a Degustti.');
    process.exit(1);
  }

  // 2. Busca clientes recentes com telefone válido
  const { rows: customers } = await db.query(
    `SELECT DISTINCT ON (
       regexp_replace(customer_phone, '[^0-9]', '', 'g')
     )
       customer_name  AS name,
       customer_phone AS phone,
       MAX(created_at) OVER (
         PARTITION BY regexp_replace(customer_phone, '[^0-9]', '', 'g')
       ) AS last_order
     FROM orders
     WHERE tenant_id = $1
       AND customer_phone IS NOT NULL
       AND customer_phone <> ''
       AND LENGTH(regexp_replace(customer_phone, '[^0-9]', '', 'g')) >= 10
     ORDER BY
       regexp_replace(customer_phone, '[^0-9]', '', 'g'),
       created_at DESC
     LIMIT $2`,
    [tenant.id, limit]
  );

  console.log(`👥 Clientes encontrados: ${customers.length}`);
  console.log(`⏱️  Delay entre envios: ${delay / 1000}s`);
  console.log(`🎬 Vídeo: ${videoPath} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log('');

  if (dryRun) {
    console.log('📋 Lista de clientes (dry-run):');
    customers.forEach((c, i) => console.log(`  ${String(i + 1).padStart(3)}. ${c.name} — ${c.phone}`));
    console.log('');
    console.log('✅ Dry-run concluído. Remova --dry-run para enviar de verdade.');
    await db.end();
    return;
  }

  // 3. Lê vídeo como base64
  console.log('📦 Lendo vídeo...');
  const videoBuffer = fs.readFileSync(videoPath);
  const base64Video = videoBuffer.toString('base64');
  console.log(`✅ Base64 gerado (${(base64Video.length / 1024).toFixed(0)} KB)`);
  console.log('');

  // 4. Envia para cada cliente
  const evo = axios.create({
    baseURL: process.env.EVOLUTION_API_URL,
    headers: { apikey: process.env.EVOLUTION_API_KEY },
    timeout: 30000,
  });

  let sent = 0, failed = 0, skipped = 0;
  const errors = [];

  console.log('🚀 Iniciando envios...');
  console.log('');

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const rawPhone = c.phone.replace(/\D/g, '');
    const number   = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;

    // Pula números muito curtos
    if (number.length < 12) {
      console.log(`  [${String(i + 1).padStart(3)}/${customers.length}] ⚠️  PULADO  ${c.name} (número inválido: ${number})`);
      skipped++;
      continue;
    }

    try {
      await evo.post(`/message/sendMedia/${tenant.whatsapp_instance}`, {
        number,
        mediatype: 'video',
        media:     base64Video,
        caption:   CAPTION,
      });

      sent++;
      console.log(`  [${String(i + 1).padStart(3)}/${customers.length}] ✅ ENVIADO  ${c.name} (${number})`);
    } catch (err) {
      failed++;
      const msg = err.response?.data?.message || err.message || 'erro desconhecido';
      console.log(`  [${String(i + 1).padStart(3)}/${customers.length}] ❌ FALHOU   ${c.name} (${number}) — ${msg}`);
      errors.push({ name: c.name, phone: number, error: msg });
    }

    // Delay entre envios (exceto no último)
    if (i < customers.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // 5. Relatório final
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📊 RELATÓRIO FINAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Enviados:  ${sent}`);
  console.log(`  ❌ Falhas:    ${failed}`);
  console.log(`  ⚠️  Pulados:  ${skipped}`);
  console.log(`  📱 Total:     ${customers.length}`);

  if (errors.length > 0) {
    console.log('');
    console.log('  Falhas:');
    errors.forEach(e => console.log(`    • ${e.name} (${e.phone}): ${e.error}`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  await db.end();
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
