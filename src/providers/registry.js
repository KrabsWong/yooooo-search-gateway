//! Provider catalog. Every vendor difference is resolved here or in its adapter.

import { deepseekProvider } from './deepseek.js';

const CATALOG = [
  {
    id: 'deepseek',
    name: 'DeepSeek Search & Fetch',
    capabilities: ['search', 'fetch'],
    models: [],
    default_model: null,
    enabled: (config) => Boolean(config.providers.deepseek?.apiKey),
    adapter: deepseekProvider,
  },
  {
    id: 'tencent-tokenplan',
    name: 'Tencent TokenHub (Anthropic Messages web search)',
    capabilities: ['search'],
    models: ['deepseek-v4-pro', 'deepseek-v4-pro-0813', 'deepseek-v4.1-flash', 'deepseek-v4.1-flash-1017'],
    default_model: 'deepseek-v4-pro',
    note: 'Planned: web_search_20250305 adapter; fetch composed with DeepSeek.',
    enabled: () => false,
    adapter: null,
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go subscription',
    capabilities: ['model', 'synthesis'],
    models: [],
    default_model: null,
    note: 'No verified native search endpoint; not a search backend.',
    enabled: () => false,
    adapter: null,
  },
];

export function listProviders(config) {
  return CATALOG.map(({ enabled, adapter, ...metadata }) => ({
    ...metadata,
    enabled: enabled(config),
  }));
}

export function providerById(id) {
  return CATALOG.find((provider) => provider.id === id) || null;
}

export function availableAdapters(config) {
  return CATALOG.filter((provider) => provider.enabled(config) && provider.adapter)
    .map((provider) => provider.adapter);
}
