//! Tencent Cloud SCF entrypoint. API Gateway events are adapted to handleApi.

import { loadConfig } from './config.js';
import { handleApi } from './index.js';

let cachedConfig;

function config() {
  if (!cachedConfig) cachedConfig = loadConfig();
  return cachedConfig;
}

export async function main_handler(event = {}) {
  // Timer triggers and lightweight warm-up calls have no HTTP method.
  if (!event.httpMethod) return { ok: true, warmed: true };

  let body = {};
  if (event.body) {
    let raw = event.body;
    if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
  }

  const result = await handleApi({
    method: event.httpMethod,
    path: event.path || '/',
    headers: event.headers || {},
    body,
  }, config());

  return {
    statusCode: result.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(result.body),
  };
}
