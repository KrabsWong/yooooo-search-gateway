import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { deepseekProvider } from '../src/providers/deepseek.js';

const config = loadConfig({ DEEPSEEK_API_KEY: 'provider-key' });

function fakeFetch(response) {
  return async (url, options) => {
    fakeFetch.last = { url, options };
    if (response.error) throw response.error;
    return { status: response.status || 200, json: async () => response.body };
  };
}

test('search sends the native API shape and normalizes results', async () => {
  const fetchImpl = fakeFetch({
    body: {
      results: [{
        url: 'https://example.com/a',
        title: 'Article',
        content: 'body',
        date: '2026-11-20T00:00:00Z',
        authority: 3,
        rerank_score: 2.1,
      }],
    },
  });
  const result = await deepseekProvider.search({ query: 'planning', count: 99 }, config, { fetch: fetchImpl });
  assert.equal(result.sources[0].url, 'https://example.com/a');
  assert.equal(result.sources[0].score, 0.7);
  const request = JSON.parse(fakeFetch.last.options.body);
  assert.equal(request.count, config.maxCount);
  assert.equal(request.need_content, true);
  assert.match(fakeFetch.last.options.headers.authorization, /^Bearer provider-key$/);
});

test('empty search results and upstream auth failures map to stable codes', async () => {
  await assert.rejects(
    () => deepseekProvider.search({ query: 'none' }, config, { fetch: fakeFetch({ body: { results: [] } }) }),
    (error) => error.code === 'no_results',
  );
  await assert.rejects(
    () => deepseekProvider.search({ query: 'x' }, config, { fetch: fakeFetch({ status: 401, body: {} }) }),
    (error) => error.code === 'auth',
  );
});

test('fetch returns Markdown content and rejects bad URLs', async () => {
  const fetchImpl = fakeFetch({ body: { title: 'Page', content: 'Markdown body' } });
  const page = await deepseekProvider.fetch('https://example.com/a', config, { fetch: fetchImpl });
  assert.equal(page.content, 'Markdown body');
  assert.match(fakeFetch.last.url, /\/v1\/tools\/fetch$/);
  await assert.rejects(
    () => deepseekProvider.fetch('file:///etc/passwd', config, { fetch: fetchImpl }),
    (error) => error.code === 'invalid_params',
  );
});
