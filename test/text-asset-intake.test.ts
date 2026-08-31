import { describe, expect, it } from 'vitest';
import {
  InMemoryTextAssetRepository,
  PostgresTextAssetRepository,
  TextAssetConflictError,
  TextAssetIntakeService,
  TextAssetPermissionError,
  TextAssetValidationError,
} from '../src/assets/text-asset-intake.js';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';

type RecordedQuery = Readonly<{ sql: string; values: readonly unknown[] }>;

class RecordingTransaction implements SqlTransaction {
  public readonly queries: RecordedQuery[] = [];
  public constructor(private readonly results: SqlQueryResult<unknown>[]) {}
  public query<Row>(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.queries.push({ sql, values });
    return Promise.resolve((this.results.shift() ?? { rows: [], rowCount: 0 }) as SqlQueryResult<Row>);
  }
}

class RecordingRunner implements SqlTransactionRunner {
  public constructor(public readonly sql: RecordingTransaction) {}
  public transaction<Result>(operation: (transaction: SqlTransaction) => Promise<Result>): Promise<Result> {
    return operation(this.sql);
  }
}

const tenantValue = '11111111-1111-4111-8111-111111111111';
const ownerValue = '22222222-2222-4222-8222-222222222222';
const tenant = tenantId(tenantValue);
const owner = userId(ownerValue);
const occurredAt = new Date('2026-08-20T12:00:00.000Z');
const importedAt = new Date('2026-08-31T12:00:00.000Z');
const input = {
  actorId: owner,
  requestId: 'asset_first_note',
  title: 'یادداشت تصمیم در ابهام',
  content: 'در یک تصمیم دشوار، شفاف‌گفتن محدودیت‌ها اعتماد تیم را حفظ کرد.',
  assertionText: 'من در شرایط ابهام، شفافیت درباره محدودیت‌ها را به نمایش قطعیت ترجیح می‌دهم.',
  occurredAt,
  importedAt,
  permissions: { personalUnderstanding: true as const, brandUsage: false },
};

describe('text asset intake', () => {
  it('turns one confidential text asset into traceable evidence and an assertion', async () => {
    const service = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
      tenantId: tenant,
      ownerUserId: owner,
    });
    const first = await service.importText(input);
    const repeated = await service.importText(input);
    const snapshot = await service.snapshot(owner, importedAt);

    expect(first.outcome).toBe('applied');
    expect(repeated.outcome).toBe('already_applied');
    expect(first.record).toMatchObject({
      title: input.title,
      content: input.content,
      assertionText: input.assertionText,
      sourceType: 'text_asset',
      dataClass: 'confidential',
      permissions: { personalUnderstanding: true, brandUsage: false },
    });
    expect(first.record.integritySha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(snapshot.summary).toEqual({ assets: 1, evidenceItems: 1, assertions: 1, dataRights: 0 });
  });

  it('fails closed on missing consent, duplicate content and non-owner access', async () => {
    const service = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
      tenantId: tenant,
      ownerUserId: owner,
    });
    await expect(service.importText({
      ...input,
      permissions: { personalUnderstanding: false as never, brandUsage: false },
    })).rejects.toBeInstanceOf(TextAssetPermissionError);
    await expect(service.importText({ ...input, content: 'کوتاه' })).rejects.toBeInstanceOf(
      TextAssetValidationError,
    );
    await service.importText(input);
    await expect(service.importText({ ...input, requestId: 'asset_duplicate_note' })).rejects.toBeInstanceOf(
      TextAssetConflictError,
    );
    await expect(service.snapshot(userId('other_owner'), importedAt)).rejects.toBeInstanceOf(
      TextAssetPermissionError,
    );
  });

  it('revokes brand use and deletes content through idempotent owner rights', async () => {
    const service = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
      tenantId: tenant,
      ownerUserId: owner,
    });
    const imported = await service.importText({
      ...input,
      permissions: { personalUnderstanding: true, brandUsage: true },
    });
    const revokeInput = {
      actorId: owner,
      requestId: 'asset_right_revoke_one',
      assetId: imported.record.assetId,
      operation: 'revoke_brand_usage' as const,
      reason: 'دیگر برای تحلیل برند استفاده نشود.',
      occurredAt: new Date(importedAt.getTime() + 1_000),
    };
    const revoked = await service.applyRight(revokeInput);
    const repeatedRevoke = await service.applyRight(revokeInput);
    expect(revoked).toMatchObject({
      outcome: 'applied', operation: 'revoke_brand_usage', brandUsage: false, deleted: false,
    });
    expect(repeatedRevoke.outcome).toBe('already_applied');
    const revokedSnapshot = await service.snapshot(owner, revokeInput.occurredAt);
    expect(revokedSnapshot.records[0]?.permissions.brandUsage).toBe(false);

    const deleteInput = {
      actorId: owner,
      requestId: 'asset_right_delete_one',
      assetId: imported.record.assetId,
      operation: 'delete' as const,
      reason: 'این منبع از داده‌های من حذف شود.',
      occurredAt: new Date(importedAt.getTime() + 2_000),
    };
    expect(await service.applyRight(deleteInput)).toMatchObject({ deleted: true });
    expect((await service.applyRight(deleteInput)).outcome).toBe('already_applied');
    await expect(service.snapshot(owner, deleteInput.occurredAt)).resolves.toMatchObject({
      summary: { assets: 0, evidenceItems: 0, assertions: 0, dataRights: 2 },
      records: [],
    });
    await expect(service.importText({
      ...input,
      permissions: { personalUnderstanding: true, brandUsage: true },
    })).rejects.toBeInstanceOf(TextAssetConflictError);
  });

  it('persists asset, evidence, assertion, consent, audit and outbox in one transaction', async () => {
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: '33333333-3333-4333-8333-333333333333' }], rowCount: 1 },
      { rows: [{ id: '44444444-4444-4444-8444-444444444444' }], rowCount: 1 },
      { rows: [{ id: '55555555-5555-4555-8555-555555555555' }], rowCount: 1 },
      ...Array.from({ length: 7 }, () => ({ rows: [], rowCount: 1 })),
    ]);
    const repository = new PostgresTextAssetRepository(new RecordingRunner(sql), {
      tenantId: tenantValue,
      ownerUserId: ownerValue,
    });
    const service = new TextAssetIntakeService(repository, { tenantId: tenant, ownerUserId: owner });
    const result = await service.importText(input);

    expect(result.persistence).toBe('postgres');
    expect(result.record.assetId).toBe('33333333-3333-4333-8333-333333333333');
    const combinedSql = sql.queries.map((query) => query.sql).join('\n');
    expect(combinedSql).toContain("INSERT INTO app.assets");
    expect(combinedSql).toContain("'text_asset'");
    expect(combinedSql).toContain('INSERT INTO app.assertion_evidence');
    expect(combinedSql).toContain('INSERT INTO app.consent_grants');
    expect(combinedSql).toContain("'asset.text_imported'");
    expect(combinedSql).toContain('INSERT INTO app.outbox_events');
    expect(combinedSql).toContain('INSERT INTO app.asset_intake_requests');
  });

  it('revokes PostgreSQL brand consent and records the right atomically', async () => {
    const assetId = '33333333-3333-4333-8333-333333333333';
    const evidenceId = '44444444-4444-4444-8444-444444444444';
    const assertionId = '55555555-5555-4555-8555-555555555555';
    const resultSnapshot = {
      requestId: input.requestId,
      assetId,
      evidenceId,
      assertionId,
      title: input.title,
      content: input.content,
      assertionText: input.assertionText,
      sourceType: 'text_asset',
      dataClass: 'confidential',
      integritySha256: 'a'.repeat(64),
      occurredAt: occurredAt.toISOString(),
      importedAt: importedAt.toISOString(),
      permissions: { personalUnderstanding: true, brandUsage: true },
    };
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      {
        rows: [{
          request_id: '66666666-6666-4666-8666-666666666666',
          assertion_id: assertionId,
          result_snapshot: resultSnapshot,
          asset_deleted_at: null,
        }],
        rowCount: 1,
      },
      ...Array.from({ length: 5 }, () => ({ rows: [], rowCount: 1 })),
    ]);
    const service = new TextAssetIntakeService(
      new PostgresTextAssetRepository(new RecordingRunner(sql), {
        tenantId: tenantValue,
        ownerUserId: ownerValue,
      }),
      { tenantId: tenant, ownerUserId: owner },
    );
    await expect(service.applyRight({
      actorId: owner,
      requestId: 'asset_pg_right_revoke',
      assetId,
      operation: 'revoke_brand_usage',
      reason: 'مجوز تحلیل برند لغو شود.',
      occurredAt: importedAt,
    })).resolves.toMatchObject({
      persistence: 'postgres', brandUsage: false, deleted: false,
    });
    const combinedSql = sql.queries.map((query) => query.sql).join('\n');
    expect(combinedSql).toContain("purpose = 'brand_usage'");
    expect(combinedSql).toContain('INSERT INTO app.asset_rights_requests');
    expect(combinedSql).toContain("'asset'");
    expect(combinedSql).toContain('INSERT INTO app.outbox_events');
  });
});
