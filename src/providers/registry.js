//! Provider catalog. Capabilities are internal; clients only ever see provider
//! identity. Model choice belongs to each adapter: it uses the provider's own
//! default or `auto` route, so adding a model never adds configuration here.

import { deepseekProvider } from './deepseek.js';

const CATALOG = [
  {
    id: 'deepseek',
    name: 'DeepSeek Search & Fetch',
    capabilities: ['search', 'fetch'],
    enabled: (config) => Boolean(config.providers.deepseek?.apiKey),
    adapter: deepseekProvider,
  },
  {
    id: 'tencent-tokenplan',
    name: 'Tencent TokenHub (Anthropic Messages web search)',
    capabilities: ['search'],
    enabled: () => false,
    adapter: null,
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go subscription',
    capabilities: ['model', 'synthesis'],
    enabled: () => false,
    adapter: null,
  },
];

export function listProviders(config) {
  return CATALOG.map(({ enabled, adapter, capabilities, ...metadata }) => ({
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
