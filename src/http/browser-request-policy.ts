import type { IncomingHttpHeaders } from 'node:http';

/** API-only CSRF defence; does not replace authentication at the trusted reverse proxy. */
export function browserRequestRejection(
  method: string | undefined,
  headers: IncomingHttpHeaders,
  trustedOrigins: readonly string[],
): Readonly<{ status: 403 | 415; error: string }> | undefined {
  const origin = headers['origin'];
  // Use deployment configuration, never attacker-controlled Host/X-Forwarded-*.
  if (origin !== undefined && !trustedOrigins.includes(origin)) {
    return { status: 403, error: 'cross_origin_request_denied' };
  }
  const site = headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') {
    return { status: 403, error: 'cross_origin_request_denied' };
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method ?? '')) {
    const mediaType = headers['content-type']?.split(';')[0]?.trim().toLowerCase();
    // Browser forms/no-cors fetch cannot set application/json; no CORS opt-in is served.
    // Header-less non-browser JSON clients remain supported behind authentication.
    if (mediaType !== 'application/json') return { status: 415, error: 'application_json_required' };
  }
  return undefined;
}
