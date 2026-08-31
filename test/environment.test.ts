import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../src/config/environment.js';

describe('loadEnvironment', () => {
  it('uses safe defaults', () => {
    expect(loadEnvironment({})).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnvironment({ PORT: '70000' })).toThrow('Invalid PORT');
  });

  it('loads an optional static application root', () => {
    expect(loadEnvironment({ PR_STATIC_ROOT: '/srv/pr/web' }).staticRoot).toBe('/srv/pr/web');
  });

  it('loads PostgreSQL identity only as one complete configuration', () => {
    const environment = loadEnvironment({
      DATABASE_URL: 'postgresql://pr:secret@db.example.test/pr',
      PR_TENANT_ID: '11111111-1111-4111-8111-111111111111',
      PR_OWNER_USER_ID: '22222222-2222-4222-8222-222222222222',
    });

    expect(environment.database).toEqual({
      connectionString: 'postgresql://pr:secret@db.example.test/pr',
      tenantId: '11111111-1111-4111-8111-111111111111',
      ownerUserId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects partial or non-UUID PostgreSQL identity', () => {
    expect(() => loadEnvironment({ DATABASE_URL: 'postgresql://localhost/pr' })).toThrow(
      'configured together',
    );
    expect(() =>
      loadEnvironment({
        DATABASE_URL: 'postgresql://localhost/pr',
        PR_TENANT_ID: 'tenant_primary',
        PR_OWNER_USER_ID: 'owner_primary',
      }),
    ).toThrow('must be UUIDs');
  });
});
