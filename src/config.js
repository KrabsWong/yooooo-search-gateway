//! Runtime configuration. Each provider is configured with the same two
//! variables; only the provider id changes. No vendor name appears at the top level.

function list(value, fallback = []) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function providerId(name) {
  return String(name).toLowerCase().replace(/_/g, '-');
}

function collectProviders(env) {
  const providers = {};
  for (const [name, value] of Object.entries(env)) {
    const match = /^PROVIDER_([A-Z0-9_]+)_(API_KEY|BASE_URL)$/.exec(name);
    if (!match) continue;
    const id = providerId(match[1]);
    const entry = providers[id] || { apiKey: '', baseUrl: '' };
    if (match[2] === 'API_KEY') entry.apiKey = String(value || '').trim();
    else entry.baseUrl = String(value || '').trim().replace(/\/+$/, '');
    providers[id] = entry;
  }
  return providers;
}

export function loadConfig(env = process.env) {
  return {
    // Comma separated. Authorization accepts any of them; rotation is a deploy change.
    gatewayTokens: list(env.GATEWAY_TOKEN || env.GATEWAY_TOKENS),
    // Optional global allowlist of provider ids.
    providerAllowlist: list(env.GATEWAY_PROVIDERS),
    providers: collectProviders(env),
    providerOrder: list(env.PROVIDER_ORDER || env.SEARCH_PROVIDER_ORDER, ['deepseek']),
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
  return Object.entries(config.providers)
    .filter(([, settings]) => settings.apiKey)
    .map(([id]) => id);
}
