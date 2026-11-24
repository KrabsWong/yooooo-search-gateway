import assert from 'node:assert/strict';
import test from 'node:test';
import { authorize } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { handleApi } from '../src/index.js';
import { handleMcp } from '../src/mcp.js';

const config = loadConfig({ GATEWAY_TOKEN: 'token', PROVIDER_DEEPSEEK_API_KEY: 'provider-key' });
const ctx = authorize({ authorization: 'Bearer token' }, config);

test('initialize returns protocol info and instructions', async () => {
  const result = await handleMcp({ id: 1, method: 'initialize' }, ctx, config);
  assert.equal(result.result.serverInfo.name, 'planning-search');
  assert.equal(result.result.protocolVersion, '2026-07-28');
  assert.match(result.result.instructions, /not verified evidence/);
});

test('notifications are acknowledged without a body', async () => {
  const result = await handleMcp({ method: 'notifications/initialized' }, ctx, config);
  assert.deepEqual(result, { notification: true });
  const response = await handleApi({
    method: 'POST',
    path: '/release/mcp',
    headers: { authorization: 'Bearer token' },
    body: { method: 'notifications/initialized' },
  }, config);
  assert.equal(response.status, 202);
  assert.equal(response.body, null);
});

test('tools list exposes exactly the three MCP tools', async () => {
  const result = await handleMcp({ id: 2, method: 'tools/list' }, ctx, config);
  assert.deepEqual(result.result.tools.map((tool) => tool.name), ['search', 'fetch', 'providers']);
});

test('providers tool returns provider identity only', async () => {
  const result = await handleMcp({
    id: 3,
    method: 'tools/call',
    params: { name: 'providers', arguments: {} },
  }, ctx, config);
  const body = JSON.parse(result.result.content[0].text);
  assert.equal(body.providers[0].id, 'deepseek');
  assert.equal(body.providers[0].models, undefined);
});

test('unknown tools are tool errors, unknown methods are JSON-RPC errors', async () => {
  const unknownTool = await handleMcp({
    id: 4,
    method: 'tools/call',
    params: { name: 'nope', arguments: {} },
  }, ctx, config);
  assert.equal(unknownTool.result.isError, true);
  const unknownMethod = await handleMcp({ id: 5, method: 'nope' }, ctx, config);
  assert.equal(unknownMethod.error.code, -32601);
});

test('the HTTP route requires the gateway token', async () => {
  const denied = await handleApi({
    method: 'POST', path: '/mcp', headers: {}, body: { id: 1, method: 'ping' },
  }, config);
  assert.equal(denied.status, 401);
});
