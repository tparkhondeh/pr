// Read the existing owner Basic header only from stdin; emit no credential/cookie/data.
async function main(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) { input += String(chunk); if (input.length > 2048) throw new Error('input'); }
  const decoded = Buffer.from(input.trim().replace(/^Basic /u, ''), 'base64').toString('utf8');
  if (!decoded.startsWith('pr_owner:')) throw new Error('input');
  const base = 'http://127.0.0.1:31056';
  const request = (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  if ((await request('/')).status !== 303 || (await request('/api/workbench')).status !== 401) throw new Error('anonymous');
  const page = await request('/login');
  if (!page.ok || !(await page.text()).includes('خوش آمدید')) throw new Error('page');
  const login = await request('/login', { method: 'POST', headers: { origin: 'https://pr.wealthos.ir', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'pr_owner', password: decoded.slice(9) }) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (login.status !== 303 || !cookie) throw new Error('login');
  for (const path of ['/', '/api/workbench', '/api/strategy', '/api/memory']) {
    const response = await request(path, { headers: { cookie } });
    if (!response.ok) throw new Error('private');
    await response.arrayBuffer();
  }
  if ((await request('/logout', { method: 'POST', headers: { cookie, origin: 'https://evil.invalid' } })).status !== 403) throw new Error('csrf');
  if ((await request('/logout', { method: 'POST', headers: { cookie, origin: 'https://pr.wealthos.ir' } })).status !== 303) throw new Error('logout');
  if ((await request('/api/workbench', { headers: { cookie } })).status !== 401) throw new Error('revocation');
  process.stdout.write('Session smoke passed: Persian login, private reads, CSRF, logout and revocation.\n');
}
void main().catch(() => { process.stderr.write('Session smoke failed; no private details emitted.\n'); process.exitCode = 1; });
