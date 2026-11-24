//! HTTP entrypoint shared by the local dev server and the SCF handler.

import http from 'node:http';
import { authorize } from './auth.js';
import { loadConfig, enabledProviderIds } from './config.js';
import { codeFor, errorBody, statusFor } from './errors.js';
import { handleFetch, handleProvider, handleSearch } from './gateway.js';
import { readJsonBody, sendJson } from './http.js';

const ROUTES = new Set(['/v1/provider', '/v1/search', '/v1/fetch']);

export function normalizePath(path = '') {
  const clean = String(path).split('?')[0];
  const marker = clean.indexOf('/v1/');
  if (marker >= 0) return clean.slice(marker);
  if (clean.endsWith('/health')) return '/health';
  return clean;
}

function json(status, body) {
  return { status, body };
}

export async function handleApi(request, config, deps = {}) {
  const { method, path, headers = {}, body = {} } = request;
  const route = normalizePath(path);
  try {
    if (method === 'GET' && route === '/health') {
      return json(200, { ok: true, providers: enabledProviderIds(config) });
    }
    if (method !== 'POST') {
      return json(405, { error: { code: 'invalid_params', message: 'Method not allowed.' } });
    }
    if (!ROUTES.has(route)) {
      return json(404, { error: { code: 'invalid_params', message: 'Not found.' } });
    }
    const ctx = authorize(headers, config);
    if (route === '/v1/provider') return json(200, handleProvider(body, ctx, config));
    if (route === '/v1/search') return json(200, await handleSearch(body, ctx, config, deps));
    return json(200, await handleFetch(body, ctx, config, deps));
  } catch (error) {
    const code = codeFor(error);
    const message = code === 'internal' ? 'Internal gateway error.' : error.message;
    if (code === 'internal') console.error('[gateway] internal error:', error);
    return json(statusFor(error), { error: { code, message } });
  }
}

export function createServer(config = loadConfig(), deps = {}) {
  return http.createServer(async (request, response) => {
    try {
      const body = request.method === 'POST'
        ? await readJsonBody(request, config.maxBodyBytes)
        : {};
      const result = await handleApi({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body,
      }, config, deps);
      sendJson(response, result.status, result.body);
    } catch (error) {
      sendJson(response, statusFor(error), errorBody(error));
    }
  });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const port = Number(process.env.PORT || 3000);
  createServer(config).listen(port, () => {
    console.log(`yooooo-search-gateway listening on :${port}`);
  });
}
