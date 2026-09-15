import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const root = '/home/wealthos/apps/pr';
const privateRoot = `${root}/.private`;
const marker = '# wealthos-pr-private-maintenance-v1';
function main(): void {
  if (process.platform !== 'linux') throw new Error('PR server only.');
  if (process.argv.includes('--install-cron')) {
    const existing = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
    if (existing.status !== 0 && !existing.stderr.includes('no crontab')) throw new Error('Unable to read current crontab.');
    if (existing.stdout.includes(marker)) {
      process.stdout.write('PR maintenance schedule already installed.\n'); return;
    }
    writeFileSync(`${privateRoot}/crontab-before-${String(Date.now())}`, existing.stdout, { mode: 0o600, flag: 'wx' });
    const appended = `${existing.stdout.trimEnd()}\n${marker}\n` +
      `@reboot /usr/local/bin/node ${root}/runtime/private-services.cjs --recover >> ${privateRoot}/maintenance.log 2>&1\n` +
      `17 2 * * * /usr/local/bin/node ${root}/runtime/private-postgres-backup.cjs >> ${privateRoot}/maintenance.log 2>&1\n`;
    execFileSync('crontab', ['-'], { input: appended, stdio: ['pipe', 'ignore', 'ignore'] });
    const verified = execFileSync('crontab', ['-l'], { encoding: 'utf8' });
    if (verified !== appended) throw new Error('Schedule verification failed.');
    process.stdout.write('Daily encrypted backup and PR-only reboot recovery installed; existing jobs preserved.\n');
    return;
  }
  if (!process.argv.includes('--recover') || !existsSync(`${privateRoot}/runtime.json`)) {
    throw new Error('Verified persistent runtime configuration required.');
  }
  const bin = `${root}/.infrastructure/pgsql/bin`;
  const pgdata = `${privateRoot}/pgdata`;
  const state = spawnSync(`${bin}/pg_ctl`, ['status', '-D', pgdata], { stdio: 'ignore' });
  if (state.status !== 0) {
    execFileSync('/usr/local/bin/pm2', ['start', `${bin}/postgres`, '--name', 'wealthos-pr-postgres',
      '--interpreter', 'none', '--kill-timeout', '15000', '--', '-D', pgdata], { stdio: 'ignore' });
  }
  execFileSync('/usr/local/bin/pm2', ['startOrRestart', `${root}/deploy/cpanel/ecosystem.config.cjs`, '--update-env'],
    { stdio: 'ignore', env: { ...process.env, PATH: `/usr/local/bin:/usr/bin:/bin:${process.env['PATH'] ?? ''}` } });
  process.stdout.write('PR service recovery completed.\n');
}
try { main(); }
catch { process.stderr.write('Private maintenance failed; no private details emitted.\n'); process.exitCode = 1; }
