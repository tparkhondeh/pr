import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';

type OwnerVerifier = Readonly<{
  version(): string;
  maintenanceToken(): string;
  verifyPassword(password: string): Promise<boolean>;
}>;
function equalSecret(left: string, right: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(left), hash(right));
}
export function createOwnerAuthenticator(verifier: OwnerVerifier): (headers: IncomingHttpHeaders, method?: string) => Promise<boolean> {
  let successfulKey: string | undefined;
  const pending = new Map<string, Promise<boolean>>();
  return async (headers, method) => {
    try {
      const internal = headers['x-pr-maintenance-token'];
      if (typeof internal === 'string' && (method === 'GET' || method === 'HEAD')) {
        const expected = verifier.maintenanceToken();
        if (/^[a-f0-9]{64}$/u.test(expected) && equalSecret(internal, expected)) return true;
      }
      const authorization = headers.authorization;
      if (!authorization || authorization.length > 2048 || !/^Basic [A-Za-z0-9+/]+=*$/iu.test(authorization)) return false;
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      if (!decoded.startsWith('pr_owner:')) return false;
      const password = decoded.slice('pr_owner:'.length);
      if (!password || /[\r\n\0]/u.test(password)) return false;
      // Includes the current verifier bytes: rotation invalidates successful cache immediately.
      const key = createHash('sha256').update(authorization).update(verifier.version()).digest('hex');
      if (key === successfulKey) return true;
      const existing = pending.get(key);
      if (existing) return await existing;
      if (pending.size >= 4) return false;
      const check = verifier.verifyPassword(password).then((valid) => {
        if (valid) successfulKey = key;
        return valid;
      }).catch(() => false).finally(() => { pending.delete(key); });
      pending.set(key, check);
      return await check;
    } catch { return false; }
  };
}

export function cpanelOwnerVersion(): string {
  return createHash('sha256').update(readFileSync('/home/wealthos/pr.wealthos.ir/.htpasswd')).digest('hex');
}

export function createCpanelOwnerAuthenticator(): ReturnType<typeof createOwnerAuthenticator> {
  const file = '/home/wealthos/pr.wealthos.ir/.htpasswd';
  return createOwnerAuthenticator({
    version: cpanelOwnerVersion,
    maintenanceToken: () => readFileSync('/home/wealthos/apps/pr/.private/maintenance.token', 'utf8').trim(),
    verifyPassword: (password) => new Promise<boolean>((resolve) => {
      // Password travels only through stdin, never command arguments, environment or logs.
      const child = spawn('/usr/bin/htpasswd', ['-v', '-i', file, 'pr_owner'], { stdio: ['pipe', 'ignore', 'ignore'] });
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, 3000);
      child.once('error', () => { clearTimeout(timer); resolve(false); });
      child.once('exit', (code) => { clearTimeout(timer); resolve(code === 0); });
      child.stdin.on('error', () => { /* Child failure is handled above without disclosing input. */ });
      child.stdin.end(`${password}\n`);
    }),
  });
}
