import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const root = '/home/wealthos/apps/pr';
async function main(): Promise<void> {
  if (process.platform !== 'linux') throw new Error('PR server only.');
  let basic: string | undefined;
  if (process.argv.includes('--basic-stdin')) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += String(chunk);
      if (input.length > 2048) throw new Error('Oversized private input.');
    }
    basic = input.trim();
  }
  const candidate = JSON.parse(readFileSync(`${root}/.private/runtime-candidate.json`, 'utf8')) as NodeJS.ProcessEnv;
  const entry = process.argv.includes('--auth-candidate') ? `${root}/.deploy-backups/auth-candidate-main.cjs` : `${root}/runtime/main.cjs`;
  const child = spawn(process.execPath, [entry], {
    cwd: root, stdio: 'ignore', env: { PATH: process.env['PATH'], NODE_ENV: 'production',
      DATABASE_URL: candidate['DATABASE_URL'], PR_TENANT_ID: candidate['PR_TENANT_ID'],
      PR_OWNER_USER_ID: candidate['PR_OWNER_USER_ID'], PR_ALLOW_EPHEMERAL_PRODUCTION: 'false',
      PR_BIND_HOST: '127.0.0.1', PORT: '31058', PR_STATIC_ROOT: `${root}/apps/web/dist` },
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (child.exitCode !== null) throw new Error('Canary exited.');
      await setTimeout(500);
      try {
        const response = await fetch('http://127.0.0.1:31058/ready', { signal: AbortSignal.timeout(3000) });
        const ready = await response.json() as { status: string; persistence: string; durability: string };
        if (response.ok && ready.status === 'ready' && ready.persistence === 'postgres' && ready.durability === 'persistent') {
          healthy = true; break;
        }
      } catch { /* Startup can take a moment; bounded retry only. */ }
    }
    if (!healthy) throw new Error('Persistent readiness failed.');
    const anonymous = await fetch('http://127.0.0.1:31058/api/workbench');
    if (anonymous.status !== 401) throw new Error('Internal API is not owner-authenticated.');
    const maintenanceMutation = await fetch('http://127.0.0.1:31058/api/security-probe', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pr-maintenance-token': readFileSync(`${root}/.private/maintenance.token`, 'utf8').trim() }, body: '{}' });
    if (maintenanceMutation.status !== 401) throw new Error('Maintenance token must not authorize mutations.');
    if (basic) {
      const authenticated = await fetch('http://127.0.0.1:31058/api/workbench', { headers: { authorization: basic } });
      if (!authenticated.ok) throw new Error('Owner Basic Auth did not reach application.');
    }
    for (const path of ['/', '/api/workbench', '/api/strategy', '/api/model-governance']) {
      const response = await fetch(`http://127.0.0.1:31058${path}`, { signal: AbortSignal.timeout(5000),
        headers: { 'x-pr-maintenance-token': readFileSync(`${root}/.private/maintenance.token`, 'utf8').trim() } });
      if (!response.ok) throw new Error('Persistent read smoke failed.');
      await response.arrayBuffer();
    }
    process.stdout.write('Persistent canary ready; anonymous API denied, authenticated read paths passed. Production unchanged.\n');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([new Promise<void>((resolve) => child.once('exit', () => { resolve(); })), setTimeout(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
void main().catch(() => { process.stderr.write('Private canary failed; no secret details emitted.\n'); process.exitCode = 1; });
