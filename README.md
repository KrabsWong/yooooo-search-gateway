# yooooo-search-gateway

A provider-agnostic HTTP search gateway for the `planning-search-mcp` client. Provider adapters, provider keys, failover, quotas and response normalization live here. The MCP client and the research agent see only three stable methods: `search`, `fetch` and `provider`.

## Design invariant

Provider differences stop at this service. The client never sees vendor-specific tool names, headers, model ids or response fields. Adding a backend means adding an adapter and a secret here; no app rebuild, agent config change or prompt change is needed. See `docs/SOLUTION_SEARCH_MCP.md` in the main project for the full architecture.

## HTTP API

All endpoints answer JSON. All `/v1/*` endpoints require `Authorization: Bearer <GATEWAY_TOKEN>`.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ "ok": true, "providers": ["deepseek"] }` |
| `POST` | `/v1/provider` | `{}` or `{ "id": "deepseek" }` | provider metadata with `capabilities` and `models` |
| `POST` | `/v1/search` | `{ "provider"?, "query", "count"?, "need_content"?, "ori_question"? }` | `{ "provider", "sources": [...], "warnings": [] }` |
| `POST` | `/v1/fetch` | `{ "provider"?, "url" }` | `{ "provider", "page": { "url", "title", "content" }, "warnings": [] }` |

`provider` is optional and defaults to `auto`. API Gateway stage prefixes such as `/release/v1/search` are accepted.

Canonical source fields: `url`, `title`, `content` (Markdown), `published_at` (UTC RFC 3339 or `null`), `authority` (`-1..4`), `score` (`0..1`), `site_name`.

Errors use stable codes in `{ "error": { "code", "message" } }`: `auth`, `invalid_params`, `provider_unavailable`, `rate_limit`, `no_results`, `timeout`, `fetch_failed`, `transport`, `internal`.

## Providers

| id | capabilities | status |
| --- | --- | --- |
| `deepseek` | `search`, `fetch` | enabled when its provider settings are configured |
| `tencent-tokenplan` | `search` | planned: Anthropic Messages `web_search_20250305`; fetch composed with DeepSeek |
| `opencode-go` | `model`, `synthesis` | planned: no verified native search endpoint |

## Configuration

Environment variables only; no secret is written to a file.

| Variable | Meaning |
| --- | --- |
| `GATEWAY_TOKEN` or `GATEWAY_TOKENS` | required comma-separated bearer tokens for `/v1/*` |
| `GATEWAY_PROVIDERS` | optional provider id allowlist for all tokens |
| `PROVIDER_CONFIG` | JSON map of provider id → `{ "apiKey", "baseUrl" }`; preferred when configuring several providers |
| `PROVIDER_<ID>_API_KEY` | convention form, e.g. `PROVIDER_DEEPSEEK_API_KEY` |
| `PROVIDER_<ID>_BASE_URL` | optional, e.g. `PROVIDER_DEEPSEEK_BASE_URL` |
| `PROVIDER_ORDER` | `auto` order; defaults to `deepseek` (legacy alias `SEARCH_PROVIDER_ORDER` still accepted) |

No top-level variable names a specific vendor. Adding a backend means giving it an id and adding settings under that id; the gateway code and client contract stay unchanged.
| `PORT` | local dev port; defaults to `3000` |

## Run and test

```sh
GATEWAY_TOKEN=local-token PROVIDER_DEEPSEEK_API_KEY=sk-... npm run dev
npm test
```

The service has no npm dependencies. It uses Node built-ins available in Node 20.19+: global `fetch`, `AbortSignal.timeout`, `node:test`, `node:crypto`. Local Node 22/24 also works.

## Runtime versions

Tencent Cloud SCF proper supports Node.js up to **20.19** (document 583/11060); its migration guide recommends prioritizing `Nodejs20.19`. Tencent Cloud CloudBase is a different product and offers newer runtimes (22.21, 24.11, 26.x), but the SCF handler in `src/scf.js` targets SCF proper. If a newer Node version is required, use SCF Custom Runtime or a container image; no code change is needed.

## Deploy

See `doc/DEPLOY_SCF.md` for Tencent Cloud SCF + API Gateway, including provisioned concurrency and timer warm-up. The SCF entrypoint is `src/scf.js` (`main_handler`).
