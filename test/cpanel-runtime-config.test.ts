import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync('deploy/cpanel/ecosystem.config.cjs', 'utf8');
function environment(privateConfig?: Record<string, string>): Record<string, string> {
  const module = { exports: {} as { apps?: { env: Record<string, string> }[] } };
  runInNewContext(source, { module, require: (name: string) => {
    if (name !== 'node:fs') throw new Error('Unexpected dependency');
    return { existsSync: () => privateConfig !== undefined, readFileSync: () => JSON.stringify(privateConfig) };
  } });
  const result = module.exports.apps?.[0]?.env;
  if (!result) throw new Error('Missing runtime environment');
  return result;
}
describe('private cPanel runtime configuration', () => {
  it('keeps legacy owner preview explicit until a verified runtime file is installed', () => {
    expect(environment()['PR_ALLOW_EPHEMERAL_PRODUCTION']).toBe('true');
    expect(environment()['DATABASE_URL']).toBeUndefined();
  });
  it('refuses incomplete private configuration instead of silently falling back to memory', () => {
    expect(() => environment({ DATABASE_URL: 'postgresql://localhost/pr' })).toThrow('Incomplete');
  });
  it('injects only runtime credentials and disables ephemeral override', () => {
    const env = environment({ DATABASE_URL: 'postgresql://localhost/pr', PR_TENANT_ID: 'tenant',
      PR_OWNER_USER_ID: 'owner', PR_MIGRATION_DATABASE_URL: 'must-not-enter-runtime',
      PR_BIND_HOST: '0.0.0.0', PR_ALLOW_EPHEMERAL_PRODUCTION: 'true' });
    expect(env['PR_ALLOW_EPHEMERAL_PRODUCTION']).toBe('false');
    expect(env['PR_MIGRATION_DATABASE_URL']).toBeUndefined();
    expect(env['PR_BIND_HOST']).toBe('127.0.0.1');
  });
});
