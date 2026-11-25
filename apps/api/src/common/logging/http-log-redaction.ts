/**
 * Redaction rules for pino-http request/response logs.
 *
 * The device-trust credential is emitted in the response Set-Cookie header.
 * Carrier webhook routes also carry a credential-like token in the URL path,
 * while webhook signatures arrive in request headers. These must not enter
 * retained application logs.
 */
export const HTTP_LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-carrier-signature"]',
  'req.headers["x-webhook-signature"]',
  'req.headers["x-api-key"]',
  'req.headers["x-internal-token"]',
  'req.headers["x-bootstrap-authorization"]',
  'req.headers["x-device-id"]',
  'req.headers["cf-connecting-ip"]',
  'req.headers["true-client-ip"]',
  'req.headers["x-forwarded-for"]',
  'req.headers["x-real-ip"]',
  'req.params.webhookToken',
  'res.headers.authorization',
  'res.headers["set-cookie"]',
  'res.headers["x-api-key"]',
  'err.response.headers.authorization',
  'err.response.headers["set-cookie"]',
] as const;

const SENSITIVE_PARAM_NAME = /(?:token|secret|authorization|api[_-]?key|otp|code|signature)/i;

/**
 * Strip query strings entirely and redact the carrier webhook credential path
 * segment. Query parameters are not needed for request correlation and can
 * contain OTPs, reset tokens, emails, or other sensitive values.
 */
export function sanitizeRequestUrl(url: unknown): string {
  if (typeof url !== 'string' || url.length === 0) return '/';
  const pathname = url.split(/[?#]/, 1)[0] || '/';
  return pathname.replace(
    /(\/v1\/webhooks\/carrier\/[^/]+\/)[^/]+(?=\/|$)/i,
    '$1[REDACTED]',
  );
}

/**
 * Keep useful request metadata while removing query values and redacting
 * credential-like route parameters before pino serializes the request.
 */
export function sanitizeRequestLog<T extends {
  url?: unknown;
  query?: unknown;
  params?: Record<string, unknown>;
}>(request: T): T {
  const params = Object.fromEntries(
    Object.entries(request.params ?? {}).map(([name, value]) => [
      name,
      SENSITIVE_PARAM_NAME.test(name) ? '[REDACTED]' : value,
    ]),
  );

  return {
    ...request,
    url: sanitizeRequestUrl(request.url),
    query: {},
    params,
  };
}
