//! HTTP helpers. Upstream errors never leak keys or raw provider bodies.

import { GatewayError, gatewayError } from './errors.js';

export async function readJsonBody(stream, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maxBytes) throw gatewayError('invalid_params', 'Request body is too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw gatewayError('invalid_params', 'Request body must be a JSON object.');
    }
    return value;
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw gatewayError('invalid_params', 'Request body must be valid JSON.');
  }
}

export function sendJson(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}

export async function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 30_000,
    fetchImpl = globalThis.fetch,
  } = options;
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw gatewayError('timeout', 'Upstream request timed out.');
    }
    throw gatewayError('transport', 'Upstream request failed.');
  }
  if (response.status === 401 || response.status === 403) {
    throw gatewayError('auth', 'Upstream authentication failed.');
  }
  if (response.status === 429) {
    throw gatewayError('rate_limit', 'Upstream rate limit reached.');
  }
  if (response.status === 400) {
    throw gatewayError('invalid_params', 'Upstream rejected the request.');
  }
  if (response.status >= 500) {
    throw gatewayError('transport', `Upstream returned HTTP ${response.status}.`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw gatewayError('transport', `Upstream returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw gatewayError('transport', 'Upstream returned invalid JSON.');
  }
}
