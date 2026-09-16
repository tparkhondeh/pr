import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createOwnerSessionGate } from '../src/http/owner-session.js';
import { createOwnerAuthenticator } from '../src/http/owner-authentication.js';

const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); } });
async function fixture() {
  let time = 1000;
  let version = 'v1';
  const origin = 'https://pr.wealthos.ir';
  const gate = createOwnerSessionGate({ origin, now: () => time, version: () => version,
    authenticate: createOwnerAuthenticator({ version: () => version, maintenanceToken: () => 'a'.repeat(64), verifyPassword: password => Promise.resolve(password === 'synthetic-only') }) });
  const server = createServer((req, res) => { void gate(req, res).then(handled => { if (!handled) { res.writeHead(200); res.end('private-app'); } }); });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  const request = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${String(address.port)}${path}`, { ...init, redirect: 'manual' });
  const login = (password = 'synthetic-only') => request('/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'pr_owner', password }) });
  return { request, login, origin, advance: (ms: number) => { time += ms; }, rotate: () => { version = 'v2'; } };
}
describe('owner browser sessions', () => {
  it('serves a Persian login without a Basic challenge, protects shell/API/assets', async () => {
    const f = await fixture();
    const login = await f.request('/login');
    expect(login.status).toBe(200); expect(await login.text()).toContain('خوش آمدید');
    expect(login.headers.get('www-authenticate')).toBeNull();
    expect(login.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    for (const path of ['/', '/assets/app.js', '/private']) expect((await f.request(path)).status).toBe(303);
    expect((await f.request('/api/workbench')).status).toBe(401);
  });
  it('sets a hardened opaque cookie, permits use, rotates and revokes on logout', async () => {
    const f = await fixture(); const logged = await f.login();
    expect(logged.status).toBe(303);
    const set = logged.headers.get('set-cookie') ?? '';
    expect(set).toMatch(/__Host-pr_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure/u);
    const cookie = set.split(';')[0] ?? '';
    expect((await f.request('/api/workbench', { headers: { cookie } })).status).toBe(200);
    expect((await f.request('/api/workbench', { headers: { cookie: `${cookie}; ${cookie}` } })).status).toBe(401);
    expect((await f.request('/logout', { headers: { cookie } })).status).toBe(200);
    const out = await f.request('/logout', { method: 'POST', headers: { cookie, origin: f.origin } });
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await f.request('/api/workbench', { headers: { cookie } })).status).toBe(401);
  });
  it('denies missing/foreign Origin, incorrect type, oversized input and wrong password without echoing it', async () => {
    const f = await fixture();
    for (const origin of ['', 'https://evil.invalid']) expect((await f.request('/login', { method: 'POST', headers: { origin } })).status).toBe(403);
    expect((await f.request('/login', { method: 'POST', headers: { origin: f.origin, 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await f.request('/login', { method: 'POST', headers: { origin: f.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(5000) })).status).toBe(413);
    const bad = await f.login('do-not-echo'); expect(bad.status).toBe(401); expect(await bad.text()).not.toContain('do-not-echo');
  });
  it('throttles attempts and expires idle/absolute sessions and verifier rotation', async () => {
    const f = await fixture();
    for (let i = 0; i < 10; i++) expect((await f.login('wrong')).status).toBe(401);
    expect((await f.login()).status).toBe(429); f.advance(60_001);
    let cookie = (await f.login()).headers.get('set-cookie')?.split(';')[0] ?? '';
    f.advance(30 * 60_000); expect((await f.request('/api/workbench', { headers: { cookie } })).status).toBe(401);
    cookie = (await f.login()).headers.get('set-cookie')?.split(';')[0] ?? '';
    f.rotate(); expect((await f.request('/api/workbench', { headers: { cookie } })).status).toBe(401);
    cookie = (await f.login()).headers.get('set-cookie')?.split(';')[0] ?? '';
    for (let i = 0; i < 15; i++) { f.advance(29 * 60_000); expect((await f.request('/api/workbench', { headers: { cookie } })).status).toBe(200); }
    f.advance(46 * 60_000); expect((await f.request('/api/workbench', { headers: { cookie } })).status).toBe(401);
  });
  it('ignores cached browser Basic credentials so logout cannot be bypassed by the browser', async () => {
    const f = await fixture();
    const authorization = `Basic ${Buffer.from('pr_owner:synthetic-only').toString('base64')}`;
    expect((await f.request('/api/workbench', { headers: { authorization } })).status).toBe(200);
    expect((await f.request('/api/workbench', { headers: { authorization, 'sec-fetch-site': 'same-origin' } })).status).toBe(401);
    expect((await f.request('/login', { method: 'POST', headers: { origin: f.origin, 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
  });
});
