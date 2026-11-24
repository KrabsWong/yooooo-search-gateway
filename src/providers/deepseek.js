//! DeepSeek native Search & Fetch adapter.

import { gatewayError } from '../errors.js';
import { requestJson } from '../http.js';
import { normalizeSources, truncate } from '../normalize.js';

function post(path, body, config, deps) {
  return requestJson(`${config.deepseekBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.deepseekApiKey}`,
    },
    body,
    timeoutMs: config.timeoutMs,
    fetchImpl: deps.fetch,
  });
}

export const deepseekProvider = {
  id: 'deepseek',
  capabilities: ['search', 'fetch'],

  async search(request, config, deps = {}) {
    const query = String(request.query || '').trim();
    if (query.length === 0 || [...query].length > 128) {
      throw gatewayError('invalid_params', 'Query must be 1 to 128 characters.');
    }
    const count = Math.min(
      config.maxCount,
      Math.max(1, Math.trunc(Number(request.count) || config.defaultCount)),
    );
    const body = { query, count, need_content: request.need_content !== false };
    if (request.ori_question) body.ori_question = request.ori_question;

    const json = await post('/v1/tools/search', body, config, deps);
    const results = Array.isArray(json?.results) ? json.results : [];
    if (results.length === 0) {
      throw gatewayError('no_results', 'Search returned no usable sources.');
    }
    return normalizeSources(results, config);
  },

  async fetch(url, config, deps = {}) {
    const value = String(url || '').trim();
    if (value.length > 8192 || !/^https?:\/\//i.test(value) || value.includes('@')) {
      throw gatewayError('invalid_params', 'Fetch requires an HTTP(S) URL without credentials.');
    }
    const json = await post('/v1/tools/fetch', { url: value }, config, deps);
    const content = typeof json?.content === 'string' ? json.content : '';
    if (content.trim() === '') {
      throw gatewayError('fetch_failed', 'Fetch returned no content.');
    }
    return {
      url: value,
      title: typeof json?.title === 'string' ? json.title : '',
      content: truncate(content, config.maxSourceChars),
    };
  },
};
