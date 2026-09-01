import { describe, expect, it } from 'vitest';
import {
  loadPostgresCommissioningConfig,
  quotePostgresIdentifier,
} from '../src/database/commissioning.js';

const base = {
  PR_MIGRATION_DATABASE_URL: 'postgresql://migrator:secret@127.0.0.1/pr',
  DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1/pr',
  PR_TENANT_ID: '11111111-1111-4111-8111-111111111111',
  PR_OWNER_USER_ID: '22222222-2222-4222-8222-222222222222',
  PR_TENANT_SLUG: 'wealthos-pr',
  PR_TENANT_DISPLAY_NAME: 'WealthOS PR',
  PR_OWNER_EXTERNAL_SUBJECT: 'owner:wealthos-pr',
};

describe('PostgreSQL commissioning contract', () => {
  it('loads a complete, local commissioning configuration', () => {
    expect(loadPostgresCommissioningConfig(base)).toEqual({
      migrationConnectionString: base.PR_MIGRATION_DATABASE_URL,
      runtimeConnectionString: base.DATABASE_URL,
      tenantId: base.PR_TENANT_ID,
      ownerUserId: base.PR_OWNER_USER_ID,
      tenantSlug: base.PR_TENANT_SLUG,
      tenantDisplayName: base.PR_TENANT_DISPLAY_NAME,
      ownerExternalSubject: base.PR_OWNER_EXTERNAL_SUBJECT,
    });
  });

  it('fails closed on missing identity or insecure remote transport', () => {
    expect(() => loadPostgresCommissioningConfig({
      ...base,
      PR_OWNER_EXTERNAL_SUBJECT: '',
    })).toThrow('PR_OWNER_EXTERNAL_SUBJECT is required');
    expect(() => loadPostgresCommissioningConfig({
      ...base,
      DATABASE_URL: 'postgresql://runtime:secret@db.example.test/pr?sslmode=require',
    })).toThrow('sslmode=verify-full');
  });

  it('quotes server-provided role and database identifiers', () => {
    expect(quotePostgresIdentifier('pr_runtime')).toBe('"pr_runtime"');
    expect(quotePostgresIdentifier('role"name')).toBe('"role""name"');
    expect(() => quotePostgresIdentifier('')).toThrow('Invalid PostgreSQL identifier');
  });
});
