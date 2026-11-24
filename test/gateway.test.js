import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { handleFetch, handleProvider, handleSearch } from '../src/gateway.js';

const config = loadConfig({ GATEWAY_TOKEN: 'token', PROVIDER_DEEPSEEK_API_KEY: 'provider-key' });

function source(url = 'https://example.com/a', content = 'snippet') {
  return { url, title: 'Article', content, published_at: null, authority: null, score: null, site_name: null };
}

test('provider metadata exposes capabilities without leaking adapters', () => {
  const result = handleProvider({}, { providers: [] }, config);
  const deepseek = result.providers.find((provider) => provider.id === 'deepseek');
  assert.equal(deepseek.enabled, true);
  assert.deepEqual(deepseek.capabilities, ['search', 'fetch']);
  const tokenplan = result.providers.find((provider) => provider.id === 'tencent-tokenplan');
  assert.equal(tokenplan.enabled, false);
  assert.ok(tokenplan.capabilities.includes('search'));
  assert.equal(result.default, 'deepseek');
});

test('search composes a fetch-capable backend for snippet-only providers', async () => {
  const searchOnly = {
    id: 'tencent-tokenplan',
    capabilities: ['search'],
    async search() {
      return { sources: [source()], warnings: [] };
    },
  };
  const fetcher = {
    id: 'deepseek',
    capabilities: ['fetch'],
    async fetch() {
      return { url: 'https://example.com/a', title: 'Article', content: 'full markdown body' };
    },
  };
  const result = await handleSearch({ query: 'planning' }, { providers: [] }, config, {
    adapters: [searchOnly, fetcher],
  });
  assert.equal(result.provider, 'tencent-tokenplan');
  assert.equal(result.sources[0].content, 'full markdown body');
  assert.deepEqual(result.warnings, []);
});

test('auto fails over on rate limits and keeps other errors visible', async () => {
  const limited = {
    id: 'first',
    capabilities: ['search', 'fetch'],
    async search() {
      const error = new Error('rate limited');
      error.code = 'rate_limit';
      throw error;
    },
  };
  const healthy = {
    id: 'second',
    capabilities: ['search', 'fetch'],
    async search() {
      return { sources: [source()], warnings: [] };
    },
  };
  const result = await handleSearch({ query: 'planning' }, { providers: [] }, config, {
    adapters: [limited, healthy],
  });
  assert.equal(result.provider, 'second');
  await assert.rejects(
    () => handleSearch({ query: 'x' }, { providers: [] }, config, {
      adapters: [{
        id: 'broken',
        capabilities: ['search', 'fetch'],
        async search() {
          const error = new Error('bad key');
          error.code = 'auth';
          throw error;
        },
      }],
    }),
    (error) => error.code === 'auth',
  );
});

test('fetch selects only a fetch-capable backend', async () => {
  const result = await handleFetch({ url: 'https://example.com/a' }, { providers: [] }, config, {
    adapters: [{
      id: 'deepseek',
      capabilities: ['fetch'],
      async fetch(url) {
        return { url, title: 'Page', content: 'body' };
      },
    }],
  });
  assert.equal(result.page.content, 'body');
});
