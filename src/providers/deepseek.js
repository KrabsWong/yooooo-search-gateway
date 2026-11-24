//! DeepSeek adapter using the model-native web tools on the Anthropic Messages
//! API. No standalone Search & Fetch REST endpoint is used.
//!
//! search(): deepseek_web_search -> web_search_tool_result blocks + text answer.
//! fetch():  deepseek_read_url  -> web_fetch_tool_result + model-written text.
//! The page text of read_link is encrypted in `signature` and is not available
//! to the client, so fetch content is model-derived and reported as such.

import { gatewayError } from '../errors.js';
import { requestJson } from '../http.js';
import { normalizeSources, truncate } from '../normalize.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

async function messages(body, config, deps) {
  const settings = config.providers.deepseek || {};
  const json = await requestJson(`${settings.baseUrl || DEFAULT_BASE_URL}/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: { model: MODEL, max_tokens: 4096, ...body },
    timeoutMs: config.timeoutMs,
    fetchImpl: deps.fetch,
  });
  if (json?.type === 'error') {
    throw gatewayError('transport', 'DeepSeek model generation failed.');
  }
  return json;
}

function blocks(json) {
  return Array.isArray(json?.content) ? json.content : [];
}

function citationsOf(items) {
  return items.flatMap((block) => Array.isArray(block.citations) ? block.citations : [])
    .filter((citation) => typeof citation?.url === 'string' && citation.url)
    .map((citation) => ({
      url: citation.url,
      title: typeof citation.title === 'string' ? citation.title : '',
      cited_text: typeof citation.cited_text === 'string' ? citation.cited_text : '',
    }));
}

function withCitations(text, citations) {
  if (!text || citations.length === 0) return text;
  const lines = citations.map((citation) => `- ${citation.title || citation.url}: ${citation.url}`);
  return `${text}\n\nSources:\n${lines.join('\n')}`;
}

export const deepseekProvider = {
  id: 'deepseek',
  capabilities: ['search', 'fetch'],

  async search(request, config, deps = {}) {
    const query = String(request.query || '').trim();
    if (query.length === 0 || [...query].length > 128) {
      throw gatewayError('invalid_params', 'Query must be 1 to 128 characters.');
    }
    const json = await messages({
      tools: [{ type: 'deepseek_web_search', name: 'deepseek_web_search' }],
      messages: [{
        role: 'user',
        content: `Use web search to find original sources about: ${query}. Answer concisely and cite the sources you used.`,
      }],
    }, config, deps);

    const raw = blocks(json)
      .filter((block) => block?.type === 'web_search_tool_result')
      .flatMap((block) => Array.isArray(block.content) ? block.content : [])
      .filter((item) => item?.type === 'web_search_result');
    if (raw.length === 0) {
      throw gatewayError('no_results', 'The model did not perform a web search for this query.');
    }
    const result = normalizeSources(raw, config);
    const textBlocks = blocks(json)
      .filter((block) => block?.type === 'text' && typeof block.text === 'string');
    const answer = withCitations(
      textBlocks.map((block) => block.text).join('\n').trim(),
      citationsOf(textBlocks),
    );
    if (answer) result.answer = truncate(answer, config.maxSourceChars);
    result.warnings.push('model_generated_content');
    return result;
  },

  async fetch(url, config, deps = {}) {
    const value = String(url || '').trim();
    if (value.length > 8192 || !/^https?:\/\//i.test(value) || value.includes('@')) {
      throw gatewayError('invalid_params', 'Fetch requires an HTTP(S) URL without credentials.');
    }
    const json = await messages({
      tools: [{ type: 'deepseek_read_url', name: 'deepseek_read_url' }],
      messages: [{
        role: 'user',
        content: `Read this page and return its main content, key facts and relevant links in Markdown: ${value}`,
      }],
    }, config, deps);

    const fetchBlock = blocks(json).find((block) => block?.type === 'web_fetch_tool_result');
    const details = fetchBlock?.content;
    if (details?.type === 'web_fetch_tool_result_error') {
      throw gatewayError('fetch_failed', `The model could not read this page: ${details.error_code || 'unavailable'}`);
    }
    if (details?.type !== 'web_fetch_result') {
      throw gatewayError('fetch_failed', 'The model did not read this URL; no page-derived content is available.');
    }
    const textBlocks = blocks(json)
      .filter((block) => block?.type === 'text' && typeof block.text === 'string');
    const citations = citationsOf(textBlocks);
    const content = withCitations(
      textBlocks.map((block) => block.text).join('\n').trim(),
      citations,
    );
    if (!content) throw gatewayError('fetch_failed', 'The model returned no readable content for this page.');

    return {
      url: value,
      title: typeof details?.content?.title === 'string' ? details.content.title : '',
      content: truncate(content, config.maxSourceChars),
      citations,
      warnings: ['model_generated_content'],
    };
  },
};
