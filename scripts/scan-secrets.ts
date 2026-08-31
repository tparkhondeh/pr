import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const forbiddenFiles = /(^|\/)(?:\.env(?:\..+)?|\.htpasswd)$|\.(?:key|pem|p12|pfx)$/iu;
const allowedEnvironmentFiles = new Set(['.env.example']);
const secretPatterns = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/u },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u },
  { name: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
] as const;
const binaryExtensions = new Set([
  '.gif', '.ico', '.jpeg', '.jpg', '.lockb', '.pdf', '.png', '.tar', '.webp', '.woff', '.woff2',
]);
const findings: string[] = [];

for (const path of tracked) {
  const normalized = path.replaceAll('\\', '/');
  if (forbiddenFiles.test(normalized) && !allowedEnvironmentFiles.has(normalized)) {
    findings.push(`${normalized}: forbidden secret-bearing filename`);
    continue;
  }
  if (binaryExtensions.has(extname(normalized).toLowerCase())) continue;
  const content = readFileSync(path, 'utf8');
  for (const candidate of secretPatterns) {
    if (candidate.pattern.test(content)) findings.push(`${normalized}: ${candidate.name}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Secret scan failed:\n${findings.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan passed (${String(tracked.length)} tracked files).\n`);
}
