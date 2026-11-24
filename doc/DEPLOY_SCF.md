# Deploying to Tencent Cloud SCF

The gateway runs as one SCF function behind API Gateway. Provider keys are function secrets; only the gateway token is distributed to clients.

## 1. Package

Include `package.json`, `src/` and this `doc/` folder in the function zip. No `npm install` is needed: the service uses only Node built-ins. Select the SCF runtime **Nodejs20.19** (the newest Node version in SCF proper, and the one recommended by its migration guide) and set the handler to `src/scf.js.main_handler`. The code also runs on Node 22/24 if you deploy through SCF Custom Runtime or a container image; no code change is required. CloudBase offers newer managed Node runtimes but is a different product from SCF proper.

## 2. Function environment (secrets live here, never in code)

All credentials are read from the SCF function's environment variables at runtime. Nothing is hardcoded in `src/`, and no `.env` file should be packed into the zip.

| Variable | Required | Meaning |
| --- | --- | --- |
| `GATEWAY_TOKEN` | yes | Bearer token the MCP client presents. Accepts a comma-separated list (`GATEWAY_TOKENS`) for rotation. |
| `PROVIDER_DEEPSEEK_API_KEY` | yes | Key for the `deepseek` provider. Every provider follows `PROVIDER_<ID>_API_KEY`. |
| `PROVIDER_DEEPSEEK_BASE_URL` | no | Endpoint override for that provider; defaults to `https://api.deepseek.com`. |
| `PROVIDER_ORDER` | no | `auto` order, default `deepseek` (legacy alias `SEARCH_PROVIDER_ORDER` still accepted). |
| `GATEWAY_PROVIDERS` | no | Optional allowlist of provider ids for all tokens. |

### Setting them in the SCF console

1. Open the function in the SCF console → **Function configuration** → **Environment variables**.
2. Add each variable from the table above. Use the platform's secret/KMS integration for `PROVIDER_DEEPSEEK_API_KEY` and `GATEWAY_TOKEN` if available in your account; otherwise store them as encrypted environment variables (SCF encrypts values at rest).
3. Keep the values out of API Gateway configuration, source files, test fixtures and logs. Do not commit them to either repository.
4. After changing an environment variable, publish a new version and move the alias. Environment variables are captured per version, and provisioned concurrency keeps the old version's environment until the alias moves.

### Local development

For local runs, export the same variables in the shell before `npm run dev` (the `.gitignore` excludes `.env*` so local files are never committed):

```sh
export GATEWAY_TOKEN=local-token
export PROVIDER_DEEPSEEK_API_KEY=sk-...
npm run dev
```

Verification: `curl http://localhost:3000/health` should list only providers with a configured key. `/health` never prints any token or provider key.

## 3. API Gateway

Create POST routes for `/v1/search`, `/v1/fetch` and `/v1/provider`, and a GET route for `/health`. Forward the `Authorization` header unchanged. The handler accepts a stage prefix, so `/release/v1/search` works without rewriting.

Synchronous API Gateway invocation does not retry errors. The MCP client maps the returned error code to its own tool-error contract and applies bounded retries.

## 4. Warm-up and cold start

Low call volume lets SCF reclaim idle instances. Use both layers:

1. **Provisioned concurrency** on a published version and alias, set to at least 1. SCF does not allow provisioned concurrency on `$LATEST`, so publish a version and point traffic at its alias. After a code change, publish a new version and move the alias.
2. **Timer trigger** every 5 minutes invoking the function without an HTTP method, or hitting `/health` through API Gateway. The SCF handler answers non-HTTP events immediately with `{ "ok": true, "warmed": true }` and never calls a provider. This costs no provider quota.

Keep module initialization light. Configuration is loaded once per warm instance and cached in `src/scf.js`; upstream clients are created per request from Node's built-in `fetch`.

Monitor `Coldstart` duration in SCF logs, provisioned-concurrency utilization in the console, and API Gateway p95 latency. If cold starts are still visible, raise provisioned concurrency or shorten the warm-up interval.

## 5. Client configuration

The MCP service keeps only the gateway URL and token in `~/.config/planning-search/credentials.json`:

```jsonc
{ "gateway_url": "https://<api-gateway-host>/", "token": "gateway-token" }
```

`SEARCH_GATEWAY_URL` and `SEARCH_GATEWAY_TOKEN` override the file on servers. No provider key is present on the client.

## 6. Cost controls

The gateway enforces a 30 second upstream timeout, a 10 result cap, 16 KB per source, a 60 KB response cap, and a small result cache is planned. Provider calls are billed separately; check the current DeepSeek and TokenHub price sheets before enabling additional providers.
