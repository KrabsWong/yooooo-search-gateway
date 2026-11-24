//! Minimal sessionless Streamable HTTP MCP endpoint.
//!
//! Supports the classic lifecycle (initialize -> notifications/initialized ->
//! tools/list -> tools/call) with direct JSON responses, plus the 2026-07-28
//! self-contained POST style. No SSE stream or Mcp-Session-Id is required.

import { handleFetch, handleProvider, handleSearch } from './gateway.js';

const PROTOCOL = '2026-07-28';

const TOOLS = [
  {
    name: 'search',
    description: 'Search the web with model-native web tools and return structured sources with original URLs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Search query, 1 to 128 characters.' },
        count: { type: 'integer', description: 'Number of sources; capped by the server.' },
        need_content: { type: 'boolean', description: 'Include fetched page content. Defaults to true.' },
        ori_question: { type: 'string', description: 'Optional original research question.' },
        provider: { type: 'string', description: 'Optional provider id; defaults to auto.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch',
    description: 'Have the model read one original URL and return a usable plaintext summary with citations.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string', description: 'HTTP(S) URL, at most 8192 characters.' },
        provider: { type: 'string', description: 'Optional provider id; defaults to auto.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'providers',
    description: 'List configured search providers. Returns provider ids only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
];

function ok(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function fail(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toolResult(body, isError = false) {
  return {
    content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
    isError,
  };
}

function errorText(error) {
  return { error: { code: error.code || 'transport', message: error.message || 'Tool call failed.' } };
}

async function callTool(name, args, ctx, config) {
  switch (name) {
    case 'search':
      return toolResult(await handleSearch(args || {}, ctx, config));
    case 'fetch':
      return toolResult(await handleFetch(args || {}, ctx, config));
    case 'providers':
      return toolResult(handleProvider({}, ctx, config));
    default:
      return toolResult({ error: { code: 'invalid_params', message: `Unknown tool: ${name}` } }, true);
  }
}

export async function handleMcp(message, ctx, config) {
  const id = message?.id;
  const method = message?.method;
  const isNotification = id === undefined || id === null;

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return { notification: true };
  }
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: 'planning-search', version: '1' },
      instructions: 'Use search and fetch for evidence. A search snippet alone is not verified evidence; model-derived page content must be labelled as such.',
    });
  }
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments, ctx, config);
      return ok(id, result);
    } catch (error) {
      return ok(id, toolResult(errorText(error), true));
    }
  }
  if (isNotification) return { notification: true };
  return fail(id, -32601, 'Method not found');
}
