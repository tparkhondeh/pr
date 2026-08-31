import { describe, expect, it } from 'vitest';
import {
  ClaimGovernanceBlockedError,
  ClaimGovernanceConflictError,
  ClaimGovernancePermissionError,
  ClaimGovernanceService,
  InMemoryClaimGovernanceRepository,
  PostgresClaimGovernanceRepository,
  type ClaimReviewCommand,
} from '../src/claims/governance.js';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryResearchWorkspaceRepository,
  ResearchWorkspaceService,
} from '../src/research/workspace.js';

const tenant = tenantId('11111111-1111-4111-8111-111111111111');
const owner = userId('22222222-2222-4222-8222-222222222222');
const outsider = userId('33333333-3333-4333-8333-333333333333');
const now = new Date('2026-08-31T18:00:00.000Z');

function setup() {
  const research = new ResearchWorkspaceService(
    new InMemoryResearchWorkspaceRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
  const repository = new InMemoryClaimGovernanceRepository();
  const claims = new ClaimGovernanceService(
    repository,
    { tenantId: tenant, ownerUserId: owner },
    {
      drafts: { snapshot: () => Promise.resolve(null) },
      research,
    },
  );
  return { claims, repository, research };
}

async function importResearch(
  research: ResearchWorkspaceService,
  overrides: Partial<Parameters<ResearchWorkspaceService['importSource']>[0]> = {},
) {
  return research.importSource({
    actorId: owner,
    requestId: 'claim_source_one',
    title: 'گزارش رسمی اعتماد سازمانی',
    publisher: 'مرکز پژوهش نمونه',
    url: 'https://research.example.org/report',
    excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را به‌صورت مستند بررسی می‌کند.',
    statement: 'بر اساس این تحقیق، شفافیت تصمیم اعتماد سازمانی را حفظ می‌کند.',
    quality: 'primary',
    stance: 'supports',
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    maxAgeDays: 90,
    accessedAt: now,
    ...overrides,
  });
}

describe('claim governance', () => {
  it('requires explicit human attestation and keeps verification separate from publication consent', async () => {
    const { claims, repository, research } = setup();
    const imported = await importResearch(research);
    const proposed = await claims.snapshot(owner, now);
    expect(proposed).toMatchObject({
      summary: { totalClaims: 1, proposed: 1, publicReady: 0 },
      claims: [{ claimId: imported.record.claimId, status: 'proposed', traceStatus: 'complete' }],
    });

    const reviewInput = {
      actorId: owner,
      requestId: 'claim_review_one',
      claimId: imported.record.claimId,
      expectedStatus: 'proposed' as const,
      decision: 'verify' as const,
      rationale: 'من Source، تاریخ، Excerpt و Statement را با سند اصلی تطبیق دادم.',
      reviewedAt: now,
    };
    await expect(claims.review({ ...reviewInput, humanAttestation: false })).rejects.toBeInstanceOf(
      ClaimGovernanceBlockedError,
    );
    await expect(claims.review({ ...reviewInput, humanAttestation: true })).resolves.toMatchObject({
      outcome: 'applied', persistence: 'memory', review: { resultingStatus: 'verified' },
    });
    await expect(claims.review({ ...reviewInput, humanAttestation: true })).resolves.toMatchObject({
      outcome: 'already_applied',
    });
    const verified = await claims.snapshot(owner, now);
    expect(verified).toMatchObject({
      summary: { verified: 1, publicReady: 0 },
      claims: [{ status: 'verified', canUsePublicly: false }],
    });
    await expect(repository.effectiveStatus(tenant, owner, imported.record.claimId, 'proposed')).resolves.toBe('verified');
  });

  it('blocks verification when supporting and contradicting sources conflict', async () => {
    const { claims, research } = setup();
    const first = await importResearch(research);
    await importResearch(research, {
      requestId: 'claim_source_two',
      title: 'نقد گزارش اعتماد سازمانی',
      publisher: 'مرکز بررسی روش',
      url: 'https://review.example.org/critique',
      stance: 'contradicts',
    });
    const snapshot = await claims.snapshot(owner, now);
    expect(snapshot.claims.every((claim) => claim.traceStatus === 'conflicted')).toBe(true);
    await expect(claims.review({
      actorId: owner,
      requestId: 'claim_review_conflicted',
      claimId: first.record.claimId,
      expectedStatus: 'proposed',
      decision: 'verify',
      rationale: 'این توضیح عمداً برای آزمون مسدودشدن Review متعارض ثبت شده است.',
      humanAttestation: true,
      reviewedAt: now,
    })).rejects.toMatchObject({ reason: 'trace_incomplete' });
  });

  it('is owner-only and rejects idempotency key reuse with changed rationale', async () => {
    const { claims, research } = setup();
    const imported = await importResearch(research);
    await expect(claims.snapshot(outsider, now)).rejects.toBeInstanceOf(ClaimGovernancePermissionError);
    const input = {
      actorId: owner,
      requestId: 'claim_review_dispute',
      claimId: imported.record.claimId,
      expectedStatus: 'proposed' as const,
      decision: 'dispute' as const,
      rationale: 'این Claim تا روشن‌شدن روش استخراج داده باید مورد اعتراض باقی بماند.',
      humanAttestation: false,
      reviewedAt: now,
    };
    await claims.review(input);
    await expect(claims.review({ ...input, rationale: 'یک Rationale متفاوت که نباید با همان Request ID پذیرفته شود.' }))
      .rejects.toBeInstanceOf(ClaimGovernanceConflictError);
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

describe('Postgres claim governance repository', () => {
  it('locks, updates, records trace, audit and outbox in one transaction', async () => {
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ status: 'proposed' }], rowCount: 1 },
      ...Array.from({ length: 4 }, () => ({ rows: [], rowCount: 1 })),
    ]);
    const runner = new RecordingRunner(sql);
    const repository = new PostgresClaimGovernanceRepository(runner, {
      tenantId: tenant,
      ownerUserId: owner,
    });
    const command: ClaimReviewCommand = {
      tenantId: tenant,
      actorId: owner,
      requestId: 'claim_review_pg',
      reviewId: '44444444-4444-4444-8444-444444444444',
      claimId: '55555555-5555-4555-8555-555555555555',
      expectedStatus: 'proposed',
      decision: 'verify',
      resultingStatus: 'verified',
      rationale: 'بازبین انسانی Source و Evidence را با Statement دقیق تطبیق داده است.',
      traceSnapshot: { traceStatus: 'complete', humanAttestation: true },
      reviewedAt: now,
    };

    await expect(repository.review(command)).resolves.toMatchObject({ outcome: 'applied' });
    expect(runner.transactions).toBe(1);
    expect(sql.queries.some((query) => query.sql.includes('FOR UPDATE'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes("status = 'verified'"))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.claim_reviews'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.outbox_events'))).toBe(true);
  });
});
