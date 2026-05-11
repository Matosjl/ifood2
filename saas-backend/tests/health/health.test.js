const request = require('supertest');
const app = require('../../src/app');

describe('GET /health', () => {
  it('returns 200 with success status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'ok' });
    expect(res.body.timestamp).toBeDefined();
  });
});
