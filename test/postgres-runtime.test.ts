import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isSafeDatabasePrincipal,
  latestSchemaMigration,
} from '../src/database/postgres.js';

describe('PostgreSQL runtime safety', () => {
  it('accepts only a non-privileged role with row security enabled', () => {
    expect(isSafeDatabasePrincipal({
      superuser: false,
      bypassRls: false,
      rowSecurity: 'on',
    })).toBe(true);
    expect(isSafeDatabasePrincipal({
      superuser: true,
      bypassRls: false,
      rowSecurity: 'on',
    })).toBe(false);
    expect(isSafeDatabasePrincipal({
      superuser: false,
      bypassRls: true,
      rowSecurity: 'on',
    })).toBe(false);
    expect(isSafeDatabasePrincipal({
      superuser: false,
      bypassRls: false,
      rowSecurity: 'off',
    })).toBe(false);
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
