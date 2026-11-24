//! Stable error codes shared with the MCP client and the research agent.

const STATUS = {
  auth: 401,
  invalid_params: 400,
  provider_unavailable: 400,
  rate_limit: 429,
  no_results: 404,
  timeout: 504,
  fetch_failed: 502,
  transport: 502,
  internal: 500,
};

export class GatewayError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.status = status || STATUS[code] || STATUS.internal;
  }
}

export function gatewayError(code, message, status) {
  return new GatewayError(code, message, status);
}

export function codeFor(error) {
  return error instanceof GatewayError ? error.code : 'internal';
}

export function statusFor(error) {
  return error instanceof GatewayError ? error.status : STATUS.internal;
}

export function errorBody(error) {
  const code = codeFor(error);
  const message = code === 'internal' ? 'Internal gateway error.' : error.message;
  return { error: { code, message } };
}
