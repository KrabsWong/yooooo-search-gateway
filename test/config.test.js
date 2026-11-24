import assert from 'node:assert/strict';
import test from 'node:test';
import { enabledProviderIds, loadConfig } from '../src/config.js';

test('provider settings use provider-agnostic environment names', () => {
  const config = loadConfig({
    PROVIDER_DEEPSEEK_API_KEY: 'deepseek-key',
    PROVIDER_DEEPSEEK_BASE_URL: 'https://deepseek.example.com/',
    PROVIDER_TENCENT_TOKENPLAN_API_KEY: 'tokenplan-key',
    PROVIDER_ORDER: 'tencent-tokenplan,deepseek',
  });
  assert.equal(config.providers.deepseek.apiKey, 'deepseek-key');
  assert.equal(config.providers.deepseek.baseUrl, 'https://deepseek.example.com');
  assert.equal(config.providers['tencent-tokenplan'].apiKey, 'tokenplan-key');
  assert.deepEqual(config.providerOrder, ['tencent-tokenplan', 'deepseek']);
  assert.deepEqual(enabledProviderIds(config), ['deepseek', 'tencent-tokenplan']);
});

test('PROVIDER_CONFIG supports arbitrary provider ids as JSON', () => {
  const config = loadConfig({
    PROVIDER_CONFIG: JSON.stringify({
      'new-vendor': { apiKey: 'vendor-key', baseUrl: 'https://vendor.example.com' },
    }),
  });
  assert.equal(config.providers['new-vendor'].apiKey, 'vendor-key');
  assert.deepEqual(enabledProviderIds(config), ['new-vendor']);
});

test('malformed PROVIDER_CONFIG is reported without crashing startup', () => {
  const config = loadConfig({ PROVIDER_CONFIG: '{not json' });
  assert.ok(config.warnings.some((warning) => warning.includes('PROVIDER_CONFIG')));
});

test('legacy SEARCH_PROVIDER_ORDER still works as an alias', () => {
  const config = loadConfig({ SEARCH_PROVIDER_ORDER: 'deepseek,tencent-tokenplan' });
  assert.deepEqual(config.providerOrder, ['deepseek', 'tencent-tokenplan']);
});
