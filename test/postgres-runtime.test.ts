import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isSafeDatabasePrincipal,
  latestSchemaMigration,
} from '../src/database/postgres.js';

describe('PostgreSQL runtime safety', () => {
  it('accepts only a non-privileged role with row security enabled', () => {
    const restricted = {
      superuser: false,
      bypassRls: false,
      rowSecurity: 'on',
      databaseCreate: false,
      publicSchemaCreate: false,
      createRole: false,
      createDatabase: false,
      replication: false,
    } as const;
    expect(isSafeDatabasePrincipal(restricted)).toBe(true);
    expect(isSafeDatabasePrincipal({ ...restricted, superuser: true })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, bypassRls: true })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, rowSecurity: 'off' })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, databaseCreate: true })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, publicSchemaCreate: true })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, createRole: true })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, createDatabase: true })).toBe(false);
    expect(isSafeDatabasePrincipal({ ...restricted, replication: true })).toBe(false);
  });

  it('keeps the runtime schema gate aligned with the newest migration file', () => {
    const newest = readdirSync('db/migrations')
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort()
      .at(-1)
      ?.replace(/\.sql$/u, '');
    expect(latestSchemaMigration).toBe(newest);
  });
});
