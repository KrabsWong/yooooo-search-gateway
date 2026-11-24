//! Provider-agnostic gateway logic. The MCP surface never sees vendor details.

import { gatewayError } from './errors.js';
import { fitResponse } from './normalize.js';
import { availableAdapters, listProviders, providerById } from './providers/registry.js';

const FAILOVER = new Set(['rate_limit', 'timeout', 'transport', 'fetch_failed']);

export function handleProvider(body = {}, ctx, config) {
  const providers = listProviders(config);
  if (body?.id) {
    const provider = providers.find((item) => item.id === body.id);
    if (!provider) throw gatewayError('invalid_params', `Unknown provider: ${body.id}`);
    return { provider };
  }
  return { providers, default: providers.find((item) => item.enabled)?.id || null };
}

function isAllowed(adapter, ctx, config) {
  if (ctx?.providers?.length && !ctx.providers.includes(adapter.id)) return false;
  if (config.providerAllowlist.length && !config.providerAllowlist.includes(adapter.id)) return false;
  return true;
}

function pickAdapters(kind, requested, ctx, config, injected) {
  if (injected) return injected.filter((adapter) => adapter.capabilities.includes(kind));
  const candidates = availableAdapters(config)
    .filter((adapter) => adapter.capabilities.includes(kind) && isAllowed(adapter, ctx, config));
  if (requested && requested !== 'auto') {
    const metadata = providerById(requested);
    if (!metadata || !metadata.capabilities.includes(kind)) {
      throw gatewayError('invalid_params', `Provider ${requested} does not support ${kind}.`);
    }
    const selected = candidates.find((adapter) => adapter.id === requested);
    if (!selected) throw gatewayError('provider_unavailable', `Provider ${requested} is not configured.`);
    return [selected];
  }
  return candidates.sort((a, b) => config.providerOrder.indexOf(a.id) - config.providerOrder.indexOf(b.id));
}

async function composeFetch(result, config, ctx, deps) {
  const fetchers = pickAdapters('fetch', 'auto', ctx, config, deps.adapters);
  if (fetchers.length === 0) {
    result.warnings.push('snippet_not_verified');
    return result;
  }
  const targets = result.sources.slice(0, config.fetchTop);
  let verified = 0;
  await Promise.all(targets.map(async (source) => {
    try {
      const page = await fetchers[0].fetch(source.url, config, deps);
      source.content = page.content;
      verified += 1;
    } catch {
      // Keep the snippet and flag it; never fail the whole search on one fetch.
      if (!result.warnings.includes('fetch_failed_source')) result.warnings.push('fetch_failed_source');
    }
  }));
  if (verified < targets.length && !result.warnings.includes('snippet_not_verified')) {
    result.warnings.push('snippet_not_verified');
  }
  return result;
}

export async function handleSearch(body = {}, ctx, config, deps = {}) {
  const query = String(body.query || '').trim();
  if (query.length === 0 || [...query].length > 128) {
    throw gatewayError('invalid_params', 'Query must be 1 to 128 characters.');
  }
  const adapters = pickAdapters('search', body.provider || 'auto', ctx, config, deps.adapters);
  if (adapters.length === 0) throw gatewayError('provider_unavailable', 'No search provider configured.');

  let last;
  for (const adapter of adapters) {
    try {
      let result = await adapter.search({
        query,
        count: body.count,
        need_content: body.need_content,
        ori_question: body.ori_question,
      }, config, deps);
      if (body.need_content !== false && !adapter.capabilities.includes('fetch')) {
        result = await composeFetch(result, config, ctx, deps);
      }
      return fitResponse({
        provider: adapter.id,
        sources: result.sources,
        warnings: result.warnings || [],
      }, config.maxResponseBytes);
    } catch (error) {
      if (FAILOVER.has(error.code)) {
        last = error;
        continue;
      }
      throw error;
    }
  }
  throw last || gatewayError('transport', 'All search providers failed.');
}

export async function handleFetch(body = {}, ctx, config, deps = {}) {
  const adapters = pickAdapters('fetch', body.provider || 'auto', ctx, config, deps.adapters);
  if (adapters.length === 0) throw gatewayError('provider_unavailable', 'No fetch provider configured.');
  let last;
  for (const adapter of adapters) {
    try {
      const page = await adapter.fetch(body.url, config, deps);
      return { provider: adapter.id, page, warnings: [] };
    } catch (error) {
      if (FAILOVER.has(error.code)) {
        last = error;
        continue;
      }
      throw error;
    }
  }
  throw last || gatewayError('transport', 'All fetch providers failed.');
}
