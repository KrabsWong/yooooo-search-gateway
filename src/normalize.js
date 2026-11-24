//! Normalize vendor responses into the canonical research evidence shape.

export function truncate(text, limit) {
  const value = typeof text === 'string' ? text : '';
  if ([...value].length <= limit) return value;
  return [...value].slice(0, limit).join('') + '\n[content truncated]';
}

export function normalizePublishedAt(value, warnings) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  // TokenHub Messages returns page_age in a local YYYY/MM/DD HH:MM:SS form.
  // Without a timezone it must not be published as a precise UTC timestamp.
  if (/^\d{4}\/\d{2}\/\d{2} /.test(text)) {
    if (!warnings.includes('page_age_ignored')) warnings.push('page_age_ignored');
  }
  return null;
}

export function normalizeSources(items, config, warnings = []) {
  const seen = new Set();
  const sources = [];
  for (const item of Array.isArray(items) ? items : []) {
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const content = [item.content, item.summary, item.snippet]
      .find((candidate) => typeof candidate === 'string' && candidate.trim() !== '') || '';
    const authority = Number.isFinite(item?.authority)
      ? Math.min(4, Math.max(-1, Math.trunc(item.authority)))
      : null;
    const rerank = Number.isFinite(item?.rerank_score)
      ? Math.round((Math.min(3, Math.max(0, item.rerank_score)) / 3) * 1000) / 1000
      : null;
    sources.push({
      url,
      title: typeof item.title === 'string' ? item.title : '',
      content: truncate(content, config.maxSourceChars),
      published_at: normalizePublishedAt(item.date || item.published_at || item.page_age, warnings),
      authority,
      score: rerank,
      site_name: typeof item.site_name === 'string' ? item.site_name : null,
    });
  }
  if (sources.some((source) => !source.content)) {
    warnings.push('content_unavailable');
  }
  return { sources, warnings };
}

export function fitResponse(response, maxBytes) {
  const result = { ...response, warnings: [...(response.warnings || [])] };
  const size = () => Buffer.byteLength(JSON.stringify(result));
  while (result.sources.length > 1 && size() > maxBytes) {
    result.sources.pop();
    if (!result.warnings.includes('response_truncated')) result.warnings.push('response_truncated');
  }
  if (size() > maxBytes && result.sources.length === 1) {
    result.sources[0].content = truncate(result.sources[0].content, 4_000);
    if (!result.warnings.includes('content_truncated')) result.warnings.push('content_truncated');
  }
  return result;
}
