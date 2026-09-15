import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { browserRequestRejection } from '../src/http/browser-request-policy.js';
import { createRequestHandler } from '../src/http/application.js';

const origin = 'https://pr.wealthos.ir';
const json = { 'content-type': 'application/json' };
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error) reject(error); else resolve(); });
  })));
});
describe('browser request boundary', () => {
  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', ''])('rejects simple mutation type %s', (type) => {
    expect(browserRequestRejection('POST', { 'content-type': type }, [origin])?.status).toBe(415);
  });
  it.each(['https://attacker.invalid', 'https://pr.wealthos.ir.attacker.invalid', 'https://other.wealthos.ir', 'http://pr.wealthos.ir', 'null'])('rejects untrusted origin %s', (untrusted) => {
    expect(browserRequestRejection('PUT', { ...json, origin: untrusted, host: 'attacker.invalid',
      'x-forwarded-host': 'pr.wealthos.ir', 'sec-fetch-site': 'same-origin' }, [origin])?.status).toBe(403);
  });
  it.each(['cross-site', 'same-site', 'unrecognized'])('rejects fetch metadata %s even without Origin', (site) => {
    expect(browserRequestRejection('POST', { ...json, 'sec-fetch-site': site }, [origin])?.status).toBe(403);
  });
  it('allows exact same-origin JSON and authenticated non-browser JSON clients', () => {
    expect(browserRequestRejection('POST', { ...json, origin, 'sec-fetch-site': 'same-origin' }, [origin])).toBeUndefined();
    expect(browserRequestRejection('PUT', { 'content-type': 'Application/JSON; charset=utf-8' }, [origin])).toBeUndefined();
    expect(browserRequestRejection('GET', { 'sec-fetch-site': 'none' }, [origin])).toBeUndefined();
  });
  it('rejects hostile requests before API routing; normal requests still reach the handler', async () => {
    const server = createServer((request, response) => {
      void createRequestHandler(() => ({ ready: true }), { trustedBrowserOrigins: [origin] })(request, response);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Address unavailable');
    const url = `http://127.0.0.1:${String(address.port)}/api/security-probe`;
    const denied = await fetch(url, { method: 'POST', headers: { ...json, origin: 'https://attacker.invalid' }, body: '{}' });
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    const simple = await fetch(url, { method: 'POST', body: '{}' });
    expect(simple.status).toBe(415);
    const valid = await fetch(url, { method: 'POST', headers: { ...json, origin }, body: '{}' });
    expect(valid.status).toBe(404);
  });
});
