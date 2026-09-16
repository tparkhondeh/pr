import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { createOwnerAuthenticator } from './owner-authentication.js';

type Options = {
  authenticate: ReturnType<typeof createOwnerAuthenticator>;
  version: () => string;
  origin: string;
  secure?: boolean;
  now?: () => number;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
// Fetch keeps login compatible with embedded browsers that intercept top-level form navigation.
const formScript = `if(location.protocol!=='https:')location.replace('https://pr.wealthos.ir/login');document.querySelector('form').addEventListener('submit',async function(event){event.preventDefault();const button=this.querySelector('button');const message=document.getElementById('message');button.disabled=true;message.textContent='در حال بررسی…';try{const response=await fetch(this.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(this))});const target=new URL(this.action).pathname==='/logout'?'/login':'/';if(response.ok&&new URL(response.url).pathname===target){location.replace(target);return}message.textContent=response.status===429?'تلاش‌های زیاد؛ یک دقیقه دیگر دوباره امتحان کنید.':'ورود انجام نشد. نام کاربری و رمز را بررسی کنید.';}catch{message.textContent='ارتباط برقرار نشد. دوباره امتحان کنید.';}button.disabled=false;});`;
const formPolicy = `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${createHash('sha256').update(formScript).digest('base64')}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;

/** Single-owner sessions: opaque cookies only, bounded memory, fail closed on restart/rotation. */
export function createOwnerSessionGate(options: Options) {
  const now = options.now ?? Date.now;
  const name = options.secure === false ? 'pr_session' : '__Host-pr_session';
  const sessions = new Map<string, { created: number; seen: number; version: string }>();
  let attempts: number[] = [];
  const cookie = (token: string, age: number) => `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(age)}${options.secure === false ? '' : '; Secure'}`;
  const tokenOf = (request: IncomingMessage) => {
    const values = (request.headers.cookie ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${name}=`));
    return values.length === 1 ? values[0]?.slice(name.length + 1) ?? '' : '';
  };
  const redirect = (response: ServerResponse, location: string) => {
    response.writeHead(303, { location, 'cache-control': 'no-store' }); response.end();
  };
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-frame-options', 'DENY');
    const path = new URL(request.url ?? '/', options.origin).pathname;
    const token = tokenOf(request);
    const key = digest(token);
    let version: string;
    try { version = options.version(); } catch { response.writeHead(503); response.end('ورود موقتاً در دسترس نیست.'); return true; }
    for (const [id, session] of sessions) {
      if (now() - session.created >= 8 * 3600_000 || now() - session.seen >= 30 * 60_000 || session.version !== version) sessions.delete(id);
    }
    const session = /^[a-f0-9]{64}$/u.test(token) ? sessions.get(key) : undefined;
    if (path === '/login' || path === '/logout') {
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (path === '/login' && session) { redirect(response, '/'); return true; }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': formPolicy });
        response.end(request.method === 'HEAD' ? '' : loginDocument(path === '/logout'));
        return true;
      }
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'GET, HEAD, POST' }); response.end(); return true; }
      // Native form POSTs require the exact configured Origin, never a forwarded Host.
      if (request.headers.origin !== options.origin || (request.headers['sec-fetch-site'] !== undefined && request.headers['sec-fetch-site'] !== 'same-origin')) {
        response.writeHead(403); response.end('درخواست ورود نامعتبر است.'); return true;
      }
      if (path === '/logout') {
        sessions.delete(key); response.setHeader('set-cookie', cookie('', 0)); redirect(response, '/login'); return true;
      }
      attempts = attempts.filter(time => now() - time < 60_000);
      if (attempts.length >= 10) { response.writeHead(429, { 'retry-after': '60' }); response.end('تلاش‌های زیاد؛ یک دقیقه دیگر دوباره امتحان کنید.'); return true; }
      attempts.push(now());
      if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') { response.writeHead(415); response.end(); return true; }
      let body = '';
      try {
        for await (const chunk of request) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 4096) { response.writeHead(413); response.end(); return true; }
        }
      } catch { response.writeHead(400); response.end(); return true; }
      const form = new URLSearchParams(body);
      const username = form.get('username') ?? '';
      const password = form.get('password') ?? '';
      const valid = username === 'pr_owner' && await options.authenticate({ authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }, 'POST');
      if (!valid) {
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': formPolicy });
        response.end(loginDocument(false, true)); return true;
      }
      sessions.delete(key);
      if (sessions.size >= 64) sessions.delete(sessions.keys().next().value ?? '');
      const next = randomBytes(32).toString('hex');
      sessions.set(digest(next), { created: now(), seen: now(), version });
      response.setHeader('set-cookie', cookie(next, 8 * 3600)); redirect(response, '/'); return true;
    }
    if (path === '/health' || path === '/ready') return false;
    if (session) { session.seen = now(); return false; }
    // Existing explicit Basic clients and read-only maintenance remain supported; no challenge popups.
    if (request.headers['sec-fetch-site'] === undefined) {
      attempts = attempts.filter(time => now() - time < 60_000);
      if (request.headers.authorization && attempts.length >= 10) { response.writeHead(429, { 'retry-after': '60' }); response.end(); return true; }
      if (await options.authenticate(request.headers, request.method)) return false;
      if (request.headers.authorization) attempts.push(now());
    }
    if (path.startsWith('/api/')) { response.writeHead(401, { 'content-type': 'application/json' }); response.end('{"error":"authentication_required"}'); }
    else redirect(response, '/login');
    return true;
  };
}

function loginDocument(logout: boolean, failed = false): string {
  return loginPage(logout, failed)
    .replace('action="/login"', 'action="https://pr.wealthos.ir/login"')
    .replace('action="/logout"', 'action="https://pr.wealthos.ir/logout"')
    .replace('</main>', `<p id="message" role="status" aria-live="polite"></p><script>${formScript}</script></main>`);
}

function loginPage(logout: boolean, failed = false): string {
  return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${logout ? 'خروج امن' : 'ورود'} | PR</title><style>body{margin:0;background:#f1f5f9;color:#172b3a;font-family:Tahoma,Arial,sans-serif;display:grid;place-items:center;min-height:100dvh}main{background:white;padding:32px;border-radius:20px;box-shadow:0 16px 60px #18384a18;width:min(360px,80vw)}h1{font-size:26px}p{line-height:1.9;color:#486070}label{display:block;margin:20px 0 8px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:13px;border-radius:9px;border:1px solid #9aabb5}input{direction:ltr;text-align:left}button{margin-top:24px;background:#146b61;color:white;border:0;cursor:pointer}a{display:block;margin-top:20px;color:#146b61}.error{color:#ac2430}small{display:block;margin-top:22px;color:#596c78;line-height:1.8}</style><main><span>WealthOS · PR</span><h1>${logout ? 'خروج از حساب' : 'خوش آمدید'}</h1><p>${logout ? 'با خروج، دسترسی این مرورگر به اطلاعات شما بسته می‌شود.' : 'برای ورود به فضای خصوصی برند شخصی خود، اطلاعات حساب را وارد کنید.'}</p>${failed ? '<p class="error" role="alert">نام کاربری یا رمز درست نیست. دوباره امتحان کنید.</p>' : ''}<form method="post" action="${logout ? '/logout' : '/login'}">${logout ? '' : '<label for="username">نام کاربری</label><input id="username" name="username" autocomplete="username" required maxlength="100"><label for="password">رمز عبور</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="512">'}<button type="submit">${logout ? 'خروج امن' : 'ورود به PR'}</button></form>${logout ? '<a href="/">بازگشت به برنامه</a>' : '<small>این فضا خصوصی است. می‌توانید اطلاعات ورود را در مدیر رمز مرورگر خود نگه دارید. پس از ۳۰ دقیقه عدم استفاده، ورود مجدد لازم است.</small>'}</main></html>`;
}
