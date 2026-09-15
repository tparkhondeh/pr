import { spawn, execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';

const root = '/home/wealthos/apps/pr';
const privateRoot = `${root}/.private`;
const bin = `${root}/.infrastructure/pgsql/bin`;
const socket = `${privateRoot}/pgsocket`;
async function fingerprints(client: Client): Promise<Record<string, string>> {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename");
  const result: Record<string, string> = {};
  for (const table of tables.rows) {
    if (!/^[a-z_]+$/u.test(table.tablename)) throw new Error('Unexpected table name.');
    const rows = await client.query<{ value: string }>(
      `SELECT row_to_json(t)::text AS value FROM app.${table.tablename} t ORDER BY 1`);
    result[table.tablename] = createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex');
  }
  const journal = await client.query('SELECT id,sha256 FROM public.pr_schema_migrations ORDER BY id');
  result['migrationJournal'] = createHash('sha256').update(JSON.stringify(journal.rows)).digest('hex');
  return result;
}
async function main(): Promise<void> {
  if (process.platform !== 'linux') throw new Error('PR server only.');
  const space = statfsSync(privateRoot);
  if (space.bavail * space.bsize < 1024 ** 3) throw new Error('Insufficient backup headroom; operator action required.');
  const directory = `${privateRoot}/backups`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = `${privateRoot}/backup.key`;
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = readFileSync(keyPath);
  const iv = randomBytes(12);
  const name = `pr-${new Date().toISOString().replace(/[^0-9]/gu, '')}`;
  const file = `${directory}/${name}.dump.enc`;
  const source = new Client({ host: socket, port: 31556, user: 'wealthos_dev', database: 'pr' });
  await source.connect();
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = await source.query<{ id: string }>('SELECT pg_export_snapshot() AS id');
    const id = snapshot.rows[0]?.id;
    if (!id) throw new Error('Snapshot unavailable.');
    const before = await fingerprints(source);
    const dump = spawn(`${bin}/pg_dump`, ['-h', socket, '-p', '31556', '-U', 'wealthos_dev',
      '-d', 'pr', '-Fc', '--no-owner', '--no-privileges', `--snapshot=${id}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    const completion = new Promise<void>((resolve, reject) => {
      dump.on('error', reject); dump.on('exit', (code) => {
        if (code === 0) resolve(); else reject(new Error('Dump failed.'));
      });
    });
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    await Promise.all([completion, pipeline(dump.stdout, cipher, createWriteStream(file, { flags: 'wx', mode: 0o600 }))]);
    await source.query('COMMIT');
    const manifest = { encryptedFile: file, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'),
      tables: before, createdAt: new Date().toISOString(), restoreVerified: false, restoreDatabase: '', restoreSeconds: 0 };
    writeFileSync(`${file}.json`, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
    if (process.argv.includes('--restore')) {
      const started = Date.now();
      const database = `pr_restore_${String(Date.now())}`;
      await source.query(`CREATE DATABASE ${database}`);
      await source.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
      // Authenticate the encrypted file completely before allowing pg_restore to execute any SQL.
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(cipher.getAuthTag());
      const encrypted = readFileSync(file);
      const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      execFileSync(`${bin}/pg_restore`, ['-h', socket, '-p', '31556', '-U', 'wealthos_dev',
        '-d', database, '--exit-on-error', '--no-owner', '--no-privileges'], { input: plain, stdio: ['pipe', 'ignore', 'ignore'] });
      plain.fill(0);
      const restored = new Client({ host: socket, port: 31556, user: 'wealthos_dev', database });
      await restored.connect();
      try {
        if (JSON.stringify(await fingerprints(restored)) !== JSON.stringify(before)) throw new Error('Restore fingerprint mismatch.');
      } finally { await restored.end(); }
      manifest.restoreVerified = true;
      manifest.restoreDatabase = database;
      manifest.restoreSeconds = (Date.now() - started) / 1000;
      writeFileSync(`${file}.json`, JSON.stringify(manifest), { mode: 0o600 });
    }
    const checksum = createHash('sha256');
    for await (const chunk of createReadStream(file)) checksum.update(chunk as Buffer);
    console.log(JSON.stringify({ file, sha256: checksum.digest('hex'), restoreVerified: manifest.restoreVerified,
      tablesVerified: Object.keys(before).length, restoreSeconds: manifest.restoreSeconds }));
  } finally { await source.end(); }
}
void main().catch(() => { process.stderr.write('Private backup/restore failed; no data emitted.\n'); process.exitCode = 1; });
