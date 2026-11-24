import assert from 'node:assert/strict';
import test from 'node:test';
import { fitResponse, normalizePublishedAt, normalizeSources, truncate } from '../src/normalize.js';

const config = { maxSourceChars: 100, maxResponseBytes: 1000 };

test('vendor fields normalize into the canonical shape and dedupe by URL', () => {
  const warnings = [];
  const result = normalizeSources([
    {
      url: 'https://example.com/a',
      title: 'First',
      summary: 'summary text',
      date: '2026-11-20T00:00:00Z',
      authority: 9,
      rerank_score: 2.4,
      site_name: 'Example',
    },
    { url: 'https://example.com/a', title: 'Duplicate', content: 'duplicate' },
    { url: 'https://example.com/b', content: '  ', snippet: 'snippet text' },
  ], config, warnings);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].content, 'summary text');
  assert.equal(result.sources[0].published_at, '2026-11-20T00:00:00Z');
  assert.equal(result.sources[0].authority, 4);
  assert.equal(result.sources[0].score, 0.8);
  assert.equal(result.sources[1].content, 'snippet text');
  assert.ok(warnings.includes('content_unavailable') === false);
});

test('content is truncated and page_age without timezone is not published as UTC', () => {
  assert.equal(truncate('abcdef', 3), 'abc\n[content truncated]');
  const warnings = [];
  assert.equal(normalizePublishedAt('2026/11/16 16:49:10', warnings), null);
  assert.ok(warnings.includes('page_age_ignored'));
});

test('fitResponse drops low-priority sources before truncating content', () => {
  const result = fitResponse({
    provider: 'deepseek',
    sources: [
      { url: 'https://a', content: 'a'.repeat(400) },
      { url: 'https://b', content: 'b'.repeat(400) },
    ],
    warnings: [],
  }, 500);
  assert.equal(result.sources.length, 1);
  assert.ok(result.warnings.includes('response_truncated'));
});
