import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi, normalizePath } from '../src/index.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ GATEWAY_TOKEN: 'token', DEEPSEEK_API_KEY: 'provider-key' });

test('health needs no token and strips API Gateway stage prefixes', () => {
  assert.equal(normalizePath('/release/v1/search'), '/v1/search');
  assert.equal(normalizePath('/release/health'), '/health');
});

test('health and protected routes enforce the gateway token', async () => {
  const health = await handleApi({ method: 'GET', path: '/health' }, config);
  assert.equal(health.status, 200);
  assert.deepEqual(health.body.providers, ['deepseek']);

  const denied = await handleApi({ method: 'POST', path: '/v1/provider', headers: {}, body: {} }, config);
  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, 'auth');

  const allowed = await handleApi({
    method: 'POST',
    path: '/release/v1/provider',
    headers: { authorization: 'Bearer token' },
    body: {},
  }, config);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.default, 'deepseek');
});

test('unknown routes and methods return stable errors', async () => {
  const missing = await handleApi({
    method: 'POST', path: '/v1/nope', headers: { authorization: 'Bearer token' }, body: {},
  }, config);
  assert.equal(missing.status, 404);
  const method = await handleApi({ method: 'PUT', path: '/v1/search' }, config);
  assert.equal(method.status, 405);
});
