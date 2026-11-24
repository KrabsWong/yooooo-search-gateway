import assert from 'node:assert/strict';
import test from 'node:test';
import { authorize } from '../src/auth.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({
  GATEWAY_TOKEN: 'first-token,second-token',
  GATEWAY_PROVIDERS: 'deepseek',
  DEEPSEEK_API_KEY: 'provider-key',
});

test('accepts any configured token and returns the provider allowlist', () => {
  const ctx = authorize({ Authorization: 'Bearer second-token' }, config);
  assert.deepEqual(ctx.providers, ['deepseek']);
});

test('rejects missing and invalid tokens', () => {
  assert.throws(() => authorize({}, config), /Missing Bearer token/);
  assert.throws(() => authorize({ authorization: 'Bearer nope' }, config), /Invalid gateway token/);
});

test('fails closed when no gateway token is configured', () => {
  const open = loadConfig({ DEEPSEEK_API_KEY: 'provider-key' });
  assert.throws(() => authorize({ authorization: 'Bearer anything' }, open), /not configured/);
});
