import { mkdirSync, writeFileSync } from 'node:fs';
async function main(): Promise<void> {
const directory = '/home/wealthos/apps/pr/.private';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const response = await fetch('http://127.0.0.1:31056/api/account/export');
if (!response.ok) throw new Error(`Export failed: ${String(response.status)}`);
const content = await response.text();
const snapshot = JSON.parse(content) as { data: {
  memory?: { summary?: Record<string, number> }; assets?: { summary?: Record<string, number> };
  activity?: { summary?: Record<string, number> } } };
const path = `${directory}/pre-postgres-${String(Date.now())}.json`;
writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
if (process.argv.includes('--require-empty')) {
  const data = snapshot.data;
  if (data.memory?.summary?.['total'] !== 0 || data.assets?.summary?.['assets'] !== 0 ||
    data.assets.summary['evidenceItems'] !== 0 || data.assets.summary['assertions'] !== 0 ||
    data.activity?.summary?.['total'] !== data.activity?.summary?.['exports']) {
    throw new Error('Live user state needs migration; export preserved.');
  }
}
console.log(JSON.stringify({ path, memory: snapshot.data.memory?.summary,
  assets: snapshot.data.assets?.summary, activity: snapshot.data.activity?.summary }));
}
void main().catch(() => { process.stderr.write('Private export failed.\n'); process.exitCode = 1; });
