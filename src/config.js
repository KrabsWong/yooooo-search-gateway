//! Runtime configuration. Provider settings are keyed by provider id, never by
//! a vendor name hardcoded into a top-level variable.

function list(value, fallback = []) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function providerId(name) {
  return String(name).toLowerCase().replace(/_/g, '-');
}

function collectProviders(env, warnings) {
  const providers = {};

  // Structured form: PROVIDER_CONFIG='{"deepseek":{"apiKey":"...","baseUrl":"..."}}'
  if (env.PROVIDER_CONFIG) {
    try {
      const parsed = JSON.parse(env.PROVIDER_CONFIG);
      for (const [id, value] of Object.entries(parsed || {})) {
        providers[providerId(id)] = {
          apiKey: String(value?.apiKey || '').trim(),
          baseUrl: String(value?.baseUrl || '').trim().replace(/\/+$/, ''),
        };
      }
    } catch {
      warnings.push('PROVIDER_CONFIG is not valid JSON and was ignored.');
    }
  }

  // Convention form: PROVIDER_DEEPSEEK_API_KEY / PROVIDER_DEEPSEEK_BASE_URL.
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
  const warnings = [];
  const providers = collectProviders(env, warnings);
  return {
    // Comma separated. Authorization accepts any of them; rotation is a deploy change.
    gatewayTokens: list(env.GATEWAY_TOKEN || env.GATEWAY_TOKENS),
    // Optional global allowlist of provider ids.
    providerAllowlist: list(env.GATEWAY_PROVIDERS),
    providers,
    providerOrder: list(env.PROVIDER_ORDER || env.SEARCH_PROVIDER_ORDER, ['deepseek']),
    warnings,
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
