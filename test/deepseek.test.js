import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { deepseekProvider } from '../src/providers/deepseek.js';

const config = loadConfig({ PROVIDER_DEEPSEEK_API_KEY: 'provider-key' });

function fakeFetch(response) {
  return async (url, options) => {
    fakeFetch.last = { url, options };
    if (response.error) throw response.error;
    return { status: response.status || 200, json: async () => response.body };
  };
}

function searchResponse() {
  return {
    body: {
      type: 'message',
      content: [
        { type: 'server_tool_use', name: 'deepseek_web_search', kind: 'search', input: { action: 'search', queries: ['planning'] } },
        {
          type: 'web_search_tool_result',
          kind: 'search',
          content: [{
            type: 'web_search_result',
            url: 'https://example.com/a',
            title: 'Article',
            snippet: 'summary text',
            page_age: '2026-11-20T00:00:00Z',
            site_name: 'Example',
          }],
        },
        { type: 'text', text: 'A concise answer with citations.' },
      ],
    },
  };
}

test('search calls the model Messages API and normalizes search blocks', async () => {
  const fetchImpl = fakeFetch(searchResponse());
  const result = await deepseekProvider.search({ query: 'planning' }, config, { fetch: fetchImpl });

  assert.match(fakeFetch.last.url, /\/anthropic\/v1\/messages$/);
  assert.equal(fakeFetch.last.options.headers['x-api-key'], 'provider-key');
  assert.equal(fakeFetch.last.options.headers['anthropic-version'], '2023-06-01');
  const request = JSON.parse(fakeFetch.last.options.body);
  assert.equal(request.model, 'deepseek-flash');
  assert.equal(request.tools[0].type, 'deepseek_web_search');

  assert.equal(result.sources[0].content, 'summary text');
  assert.equal(result.sources[0].published_at, '2026-11-20T00:00:00Z');
  assert.equal(result.answer, 'A concise answer with citations.');
  assert.ok(result.warnings.includes('model_generated_content'));
});

test('model citations are kept as plaintext source links', async () => {
  const response = searchResponse();
  response.body.content.push({
    type: 'text',
    text: 'A cited answer.',
    citations: [{ url: 'https://example.com/a', title: 'Article', cited_text: 'A cited answer.' }],
  });
  const result = await deepseekProvider.search({ query: 'planning' }, config, { fetch: fakeFetch(response) });
  assert.match(result.answer, /Sources:/);
  assert.match(result.answer, /https:\/\/example\.com\/a/);
});

test('a model that decides not to search yields no_results', async () => {
  await assert.rejects(
    () => deepseekProvider.search({ query: 'none' }, config, {
      fetch: fakeFetch({ body: { type: 'message', content: [{ type: 'text', text: 'No search needed.' }] } }),
    }),
    (error) => error.code === 'no_results',
  );
});

test('generation error bodies and upstream auth failures map to stable codes', async () => {
  await assert.rejects(
    () => deepseekProvider.search({ query: 'x' }, config, {
      fetch: fakeFetch({ body: { type: 'error', error: { message: 'failed' } } }),
    }),
    (error) => error.code === 'transport',
  );
  await assert.rejects(
    () => deepseekProvider.search({ query: 'x' }, config, { fetch: fakeFetch({ status: 401, body: {} }) }),
    (error) => error.code === 'auth',
  );
});

test('fetch reads the URL through the model and returns model-derived content', async () => {
  const fetchImpl = fakeFetch({
    body: {
      type: 'message',
      content: [
        { type: 'server_tool_use', name: 'deepseek_read_url', kind: 'read_link', input: { action: 'read_link', url: 'https://example.com/a' } },
        {
          type: 'web_fetch_tool_result',
          kind: 'read_link',
          content: {
            type: 'web_fetch_result',
            url: 'https://example.com/a',
            content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: '' }, title: 'Page title' },
            published_at: '2026-01-01',
          },
        },
        {
          type: 'text',
          text: 'The page explains...',
          citations: [{ url: 'https://example.com/a', title: 'Article', cited_text: 'The page explains...' }],
        },
      ],
    },
  });
  const page = await deepseekProvider.fetch('https://example.com/a', config, { fetch: fetchImpl });
  assert.equal(page.title, 'Page title');
  assert.match(page.content, /Sources:/);
  assert.equal(page.citations[0].url, 'https://example.com/a');
  assert.deepEqual(page.warnings, ['model_generated_content']);
  const request = JSON.parse(fakeFetch.last.options.body);
  assert.equal(request.tools[0].type, 'deepseek_read_url');
});

test('fetch rejects bad URLs and failed page reads', async () => {
  await assert.rejects(
    () => deepseekProvider.fetch('file:///etc/passwd', config, { fetch: fakeFetch({ body: {} }) }),
    (error) => error.code === 'invalid_params',
  );
  await assert.rejects(
    () => deepseekProvider.fetch('https://example.com/a', config, {
      fetch: fakeFetch({
        body: {
          type: 'message',
          content: [{ type: 'web_fetch_tool_result', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } }],
        },
      }),
    }),
    (error) => error.code === 'fetch_failed',
  );
  await assert.rejects(
    () => deepseekProvider.fetch('https://example.com/a', config, {
      fetch: fakeFetch({ body: { type: 'message', content: [{ type: 'text', text: 'Guessed from memory.' }] } }),
    }),
    (error) => error.code === 'fetch_failed',
  );
});
