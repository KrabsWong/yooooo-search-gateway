//! Runtime configuration. Secrets come from the environment only.

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

function list(value, fallback = []) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function loadConfig(env = process.env) {
  return {
    // Comma separated. Authorization accepts any of them; rotation is a deploy change.
    gatewayTokens: list(env.GATEWAY_TOKEN || env.GATEWAY_TOKENS),
    // Optional allowlist of provider ids for every token.
    providerAllowlist: list(env.GATEWAY_PROVIDERS),
    deepseekApiKey: String(env.DEEPSEEK_API_KEY || '').trim(),
    deepseekBaseUrl: String(env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    providerOrder: list(env.SEARCH_PROVIDER_ORDER, ['deepseek']),
    defaultCount: 8,
    maxCount: 10,
    maxSourceChars: 16_000,
    maxResponseBytes: 60_000,
    fetchTop: 3,
    timeoutMs: 30_000,
    maxBodyBytes: 1024 * 1024,
  };
}

export function enabledProviderIds(config) {
  const ids = [];
  if (config.deepseekApiKey) ids.push('deepseek');
  return ids;
}
