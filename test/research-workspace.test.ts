import { describe, expect, it } from 'vitest';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryResearchWorkspaceRepository,
  PostgresResearchWorkspaceRepository,
  ResearchConflictError,
  ResearchPermissionError,
  ResearchValidationError,
  ResearchWorkspaceService,
  type ResearchImportCommand,
} from '../src/research/workspace.js';

const tenant = tenantId('11111111-1111-4111-8111-111111111111');
const owner = userId('22222222-2222-4222-8222-222222222222');
const outsider = userId('33333333-3333-4333-8333-333333333333');
const now = new Date('2026-08-31T18:00:00.000Z');
const publishedAt = new Date('2026-08-01T00:00:00.000Z');

function service(): ResearchWorkspaceService {
  return new ResearchWorkspaceService(
    new InMemoryResearchWorkspaceRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
}

function sourceInput(overrides: Partial<Parameters<ResearchWorkspaceService['importSource']>[0]> = {}) {
  return {
    actorId: owner,
    requestId: 'research_source_one',
    title: 'گزارش رسمی درباره اعتماد سازمانی',
    publisher: 'مرکز پژوهش نمونه',
    url: 'https://research.example.org/report',
    excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را بررسی می‌کند.',
    statement: 'شفافیت تصمیم می‌تواند اعتماد سازمانی را حفظ کند.',
    quality: 'primary' as const,
    stance: 'supports' as const,
    publishedAt,
    maxAgeDays: 90,
    accessedAt: now,
    ...overrides,
  };
}

describe('research workspace', () => {
  it('keeps an external source citation-ready without auto-verifying its claim', async () => {
    const research = service();
    const imported = await research.importSource(sourceInput());
    const snapshot = await research.snapshot(owner, now);

    expect(imported).toMatchObject({ outcome: 'applied', persistence: 'memory' });
    expect(snapshot).toMatchObject({
      sourceSafety: {
        policyVersion: 'research-source-safety-v1',
        automaticFetchEnabled: false,
        failClosed: true,
      },
      summary: { totalSources: 1, citationReady: 1, stale: 0, conflicts: 0 },
      sources: [{
        qualityScore: 1,
        freshness: 'fresh',
        factCheckStatus: 'citation_ready',
        conflictDetected: false,
        usableForPublicClaim: true,
      }],
    });
    expect(snapshot.sources[0]?.citation).toContain('https://research.example.org/report');
  });

  it('detects conflicting sources for the same normalized statement', async () => {
    const research = service();
    await research.importSource(sourceInput());
    await research.importSource(sourceInput({
      requestId: 'research_source_two',
      title: 'نقد روش‌شناسی گزارش اعتماد',
      publisher: 'نشریه بررسی روش',
      url: 'https://review.example.org/critique',
      stance: 'contradicts',
    }));

    const snapshot = await research.snapshot(owner, now);
    expect(snapshot.summary.conflicts).toBe(1);
    expect(snapshot.sources).toHaveLength(2);
    expect(snapshot.sources.every((source) => (
      source.factCheckStatus === 'conflicted' && !source.usableForPublicClaim
    ))).toBe(true);
  });

  it('marks stale or unverified research for review', async () => {
    const research = service();
    await research.importSource(sourceInput({
      quality: 'unverified',
      maxAgeDays: 10,
    }));
    const snapshot = await research.snapshot(owner, now);
    expect(snapshot).toMatchObject({
      summary: { stale: 1, unverified: 1, citationReady: 0 },
      sources: [{ freshness: 'stale', factCheckStatus: 'review_required' }],
    });
  });

  it('is owner-only, idempotent, and rejects unsafe source URLs', async () => {
    const research = service();
    const input = sourceInput();
    await research.importSource(input);
    await expect(research.importSource(input)).resolves.toMatchObject({ outcome: 'already_applied' });
    await expect(research.importSource({ ...input, title: 'عنوان متعارض' })).rejects.toBeInstanceOf(
      ResearchConflictError,
    );
    await expect(research.snapshot(outsider, now)).rejects.toBeInstanceOf(ResearchPermissionError);
    await expect(service().importSource(sourceInput({
      url: 'http://research.example.org/insecure',
    }))).rejects.toBeInstanceOf(ResearchValidationError);
    for (const url of [
      'https://127.0.0.1/metadata',
      'https://metadata.internal/latest',
      'https://research.example.org/report?access_token=synthetic',
      'https://research.example.org:8443/report',
    ]) {
      await expect(service().importSource(sourceInput({ url }))).rejects.toBeInstanceOf(ResearchValidationError);
    }
  });
});

type RecordedQuery = Readonly<{ sql: string; values: readonly unknown[] }>;

class RecordingTransaction implements SqlTransaction {
  public readonly queries: RecordedQuery[] = [];
  public constructor(private readonly results: SqlQueryResult<unknown>[]) {}
  public query<Row>(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.queries.push({ sql, values });
    return Promise.resolve((this.results.shift() ?? { rows: [], rowCount: 1 }) as SqlQueryResult<Row>);
  }
}

class RecordingRunner implements SqlTransactionRunner {
  public transactions = 0;
  public constructor(public readonly sql: RecordingTransaction) {}
  public async transaction<Result>(operation: (transaction: SqlTransaction) => Promise<Result>): Promise<Result> {
    this.transactions += 1;
    return operation(this.sql);
  }
}

describe('Postgres research workspace repository', () => {
  it('records evidence and a proposed external claim with audit and outbox atomically', async () => {
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      ...Array.from({ length: 6 }, () => ({ rows: [], rowCount: 1 })),
    ]);
    const runner = new RecordingRunner(sql);
    const repository = new PostgresResearchWorkspaceRepository(runner, {
      tenantId: tenant,
      ownerUserId: owner,
    });
    const command: ResearchImportCommand = {
      tenantId: tenant,
      actorId: owner,
      requestId: 'research_pg_source',
      sourceId: '44444444-4444-4444-8444-444444444444',
      claimId: '55555555-5555-4555-8555-555555555555',
      evidenceId: '66666666-6666-4666-8666-666666666666',
      title: 'گزارش رسمی درباره اعتماد سازمانی',
      publisher: 'مرکز پژوهش نمونه',
      url: 'https://research.example.org/report',
      excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را بررسی می‌کند.',
      statement: 'شفافیت تصمیم می‌تواند اعتماد سازمانی را حفظ کند.',
      quality: 'primary',
      stance: 'supports',
      publishedAt,
      accessedAt: now,
      maxAgeDays: 90,
    };

    await expect(repository.importSource(command)).resolves.toMatchObject({ outcome: 'applied' });
    expect(runner.transactions).toBe(1);
    expect(sql.queries.some((query) => query.sql.includes('app.evidence_items'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes("'external_fact', 'proposed'"))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.claim_evidence'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.research_sources'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.outbox_events'))).toBe(true);
  });
});
