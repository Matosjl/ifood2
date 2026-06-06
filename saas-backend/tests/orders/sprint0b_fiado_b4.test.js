/**
 * Sprint 0B — B4: deleteCliente filtra pendências por tenant_id
 *
 * Garante que:
 *  - Cliente de tenantA com compra pendente em tenantA → bloqueado (correto)
 *  - Cliente de tenantA sem compra pendente → deletado (mesmo que tenantB tenha algo)
 *  - Compra de tenantB com cliente_id de tenantA não bloqueia delete de tenantA
 */

jest.mock('../../src/queues/order.queue', () => ({
  enqueueAndWait: jest.fn(),
  getQueue:       jest.fn(),
  getQueueEvents: jest.fn(),
  closeQueue:     jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app     = require('../../src/app');
const db      = require('../../src/config/database');
const { createTestTenant, cleanupTenant } = require('../helpers/db');
const { makeToken } = require('../helpers/auth');

let tenantA, tenantB;
let tokenA;

beforeAll(async () => {
  [tenantA, tenantB] = await Promise.all([
    createTestTenant(),
    createTestTenant(),
  ]);
  tokenA = makeToken({ userId: tenantA.userId, tenantId: tenantA.tenantId });
});

afterAll(async () => {
  await Promise.all([
    cleanupTenant(tenantA.tenantId),
    cleanupTenant(tenantB.tenantId),
  ]);
});

describe('B4 — deleteCliente filtra fiado_compras por tenant_id', () => {
  it('409 — bloqueia se o próprio tenant tem compra pendente', async () => {
    // Cria cliente em tenantA
    const { rows: [cli] } = await db.query(
      `INSERT INTO fiado_clientes (tenant_id, name) VALUES ($1, 'Cliente Com Débito') RETURNING id`,
      [tenantA.tenantId]
    );

    // Compra pendente no próprio tenantA
    await db.query(
      `INSERT INTO fiado_compras (tenant_id, cliente_id, descricao, valor, status)
       VALUES ($1, $2, 'Compra teste', 50.00, 'pendente')`,
      [tenantA.tenantId, cli.id]
    );

    const res = await request(app)
      .delete(`/api/fiado/clientes/${cli.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('200 — permite deletar se só tenantB tem pendência com o cliente_id (B4 fix)', async () => {
    // Cria cliente em tenantA sem compras
    const { rows: [cli] } = await db.query(
      `INSERT INTO fiado_clientes (tenant_id, name) VALUES ($1, 'Cliente Limpo') RETURNING id`,
      [tenantA.tenantId]
    );

    // Simula cenário pré-fix: insere compra em tenantB apontando para o mesmo cliente_id
    // (não deveria bloquear delete em tenantA após o fix)
    await db.query(
      `INSERT INTO fiado_compras (tenant_id, cliente_id, descricao, valor, status)
       VALUES ($1, $2, 'Compra cross-tenant', 30.00, 'pendente')`,
      [tenantB.tenantId, cli.id]
    );

    const res = await request(app)
      .delete(`/api/fiado/clientes/${cli.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Com o fix (tenant_id no WHERE), não deve ser bloqueado pela compra do tenantB
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
