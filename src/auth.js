//! Gateway token authentication. Provider keys never reach this layer.

import crypto from 'node:crypto';
import { gatewayError } from './errors.js';

function safeEqual(expected, presented) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(presented));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function authorize(headers = {}, config) {
  if (!config.gatewayTokens.length) {
    throw gatewayError('auth', 'Gateway token is not configured.');
  }
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization');
  const match = typeof entry?.[1] === 'string' ? /^Bearer\s+(.+)$/i.exec(entry[1].trim()) : null;
  if (!match) throw gatewayError('auth', 'Missing Bearer token.');
  const accepted = config.gatewayTokens.some((token) => safeEqual(token, match[1]));
  if (!accepted) throw gatewayError('auth', 'Invalid gateway token.');
  return { providers: config.providerAllowlist };
}
