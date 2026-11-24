import assert from 'node:assert/strict';
import test from 'node:test';

process.env.GATEWAY_TOKEN = 'scf-token';
process.env.DEEPSEEK_API_KEY = 'scf-provider-key';
const { main_handler } = await import('../src/scf.js');

test('timer triggers are answered without calling any provider', async () => {
  const result = await main_handler({ triggerName: 'warmup' });
  assert.deepEqual(result, { ok: true, warmed: true });
});

test('API Gateway HTTP events are adapted to the shared handler', async () => {
  const result = await main_handler({
    httpMethod: 'POST',
    path: '/release/v1/provider',
    headers: { Authorization: 'Bearer scf-token' },
    body: JSON.stringify({}),
    isBase64Encoded: false,
  });
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.default, 'deepseek');
});
