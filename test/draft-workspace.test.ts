import { describe, expect, it } from 'vitest';
import {
  InMemoryTextAssetRepository,
  TextAssetIntakeService,
} from '../src/assets/text-asset-intake.js';
import {
  ContentDraftService,
  DraftBlockedError,
  InMemoryDraftWorkspaceRepository,
  PostgresDraftWorkspaceRepository,
  type CreateDraftCommand,
} from '../src/claims/workspace.js';
import { platformAdaptationProfileVersion } from '../src/claims/platform-adaptation.js';
import { ConversationIntakeService } from '../src/conversation/intake.js';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import {
  FeedbackLearningService,
  InMemoryFeedbackLearningRepository,
} from '../src/feedback/workspace.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryStrategyContextRepository,
  StrategyContextService,
  defaultStrategyContext,
} from '../src/strategy/context.js';
import { InMemoryWorkbenchApprovalRepository } from '../src/workbench/approval-repository.js';
import { OwnerEvidenceContextService } from '../src/workbench/evidence-context.js';
import { createDefaultWorkbenchService } from '../src/workbench/workbench.js';

const tenant = tenantId('11111111-1111-4111-8111-111111111111');
const owner = userId('22222222-2222-4222-8222-222222222222');
const now = new Date('2026-08-31T18:00:00.000Z');

async function fixture() {
  const conversation = new ConversationIntakeService();
  const assets = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
    tenantId: tenant,
    ownerUserId: owner,
  });
  const approval = new InMemoryWorkbenchApprovalRepository();
  const strategy = new StrategyContextService(
    new InMemoryStrategyContextRepository(defaultStrategyContext(tenant, owner), approval),
    { tenantId: tenant, ownerUserId: owner },
  );
  const workbench = createDefaultWorkbenchService(
    () => now,
    approval,
    { tenantId: tenant, ownerUserId: owner },
    strategy,
    new OwnerEvidenceContextService(
      assets,
      conversation,
      { tenantId: tenant, ownerUserId: owner },
      () => now,
    ),
  );
  const approvedAsset = await assets.importText({
    actorId: owner,
    requestId: 'asset_draft_approved',
    title: 'یادداشت تصمیم شفاف',
    content: 'این یادداشت یک تجربه واقعی از ترجیح شفافیت بر نمایش‌گری در یک تصمیم دشوار را ثبت می‌کند.',
    assertionText: 'در یک تصمیم دشوار، شفافیت بر نمایش‌گری ترجیح داده شد.',
    occurredAt: now,
    importedAt: now,
    permissions: { personalUnderstanding: true, brandUsage: true },
  });
  const turn = await conversation.submitTurn({
    tenantId: tenant,
    actorId: owner,
    conversationId: 'conversation_draft',
    turnId: 'turn_draft_source',
    text: 'در یک تصمیم دشوار، شفافیت را به نمایش‌گری ترجیح دادم.',
    proposeMemory: true,
    occurredAt: now,
  });
  if (!turn.memoryProposal) throw new Error('Test memory proposal missing.');
  await conversation.confirmMemory({
    tenantId: tenant,
    actorId: owner,
    proposalId: turn.memoryProposal.id,
    permissions: { personalUnderstanding: true, brandUsage: true, publicUsage: false },
    confirmedAt: now,
  });
  await workbench.approve('essay', owner, now);
  const learning = new FeedbackLearningService(
    new InMemoryFeedbackLearningRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
  const service = new ContentDraftService(
    new InMemoryDraftWorkspaceRepository(),
    { tenantId: tenant, ownerUserId: owner },
    conversation,
    workbench,
    strategy,
    learning,
    assets,
  );
  return {
    service,
    conversation,
    learning,
    assets,
    workbench,
    approvedAssetRef: approvedAsset.record.assetId,
    approvedAssetEvidenceId: approvedAsset.record.evidenceId,
    proposalId: turn.memoryProposal.id,
  };
}

describe('evidence-bound draft workspace', () => {
  it('creates, rechecks edits, approves and exports only the reviewed revision', async () => {
    const { service, proposalId } = await fixture();
    const created = await service.create({
      actorId: owner,
      requestId: 'draft_create_one',
      sourceKind: 'memory',
      sourceRef: proposalId,
      channel: 'linkedin',
      narrativeAngle: 'چرا کیفیت تصمیم از نمایش نتیجه مهم‌تر است؟',
      takeaway: 'اعتماد با صداقت در ابهام ساخته می‌شود.',
      publicDraftingConsent: true,
      occurredAt: now,
    });
    expect(created.snapshot).toMatchObject({
      revision: 1,
      status: 'awaiting_approval',
      guard: { classification: 'green' },
      adaptation: { version: 'platform-adaptation-v1', hardMaximumCharacters: 3000 },
      source: { kind: 'memory', ref: proposalId, evidenceIds: ['evidence_turn_draft_source'] },
    });

    const unsafe = await service.edit({
      actorId: owner,
      requestId: 'draft_edit_unsafe',
      draftId: created.snapshot.draftId,
      expectedRevision: 1,
      body: `${created.snapshot.body}\nدرآمد شرکت ۵ برابر شد.`,
      occurredAt: now,
    });
    expect(unsafe.snapshot).toMatchObject({ status: 'guard_failed', guard: { classification: 'red' } });
    await expect(service.approve({
      actorId: owner,
      requestId: 'draft_approve_unsafe',
      draftId: unsafe.snapshot.draftId,
      expectedRevision: 2,
      occurredAt: now,
    })).rejects.toBeInstanceOf(DraftBlockedError);

    const safe = await service.edit({
      actorId: owner,
      requestId: 'draft_edit_safe',
      draftId: unsafe.snapshot.draftId,
      expectedRevision: 2,
      body: created.snapshot.body.replace('نظر شما چیست؟', 'تجربه شما چه بوده است؟'),
      occurredAt: now,
    });
    const approved = await service.approve({
      actorId: owner,
      requestId: 'draft_approve_safe',
      draftId: safe.snapshot.draftId,
      expectedRevision: 3,
      occurredAt: now,
    });
    const exported = await service.export({
      actorId: owner,
      requestId: 'draft_export_safe',
      draftId: approved.snapshot.draftId,
      expectedRevision: 4,
      occurredAt: now,
    });
    expect(exported).toMatchObject({
      filename: 'pr-linkedin-draft-v5.txt',
      snapshot: { status: 'exported', revision: 5 },
    });
    expect(exported.content).toContain('شفافیت را به نمایش‌گری ترجیح دادم');
  });

  it('requires explicit use consent and the approved content action', async () => {
    const { service, proposalId } = await fixture();
    await expect(service.create({
      actorId: owner,
      requestId: 'draft_without_consent',
      sourceKind: 'memory',
      sourceRef: proposalId,
      channel: 'linkedin',
      narrativeAngle: 'یک روایت قابل‌ردیابی',
      takeaway: 'یک برداشت شخصی',
      publicDraftingConsent: false,
      occurredAt: now,
    })).rejects.toThrow('Explicit public drafting consent');
  });

  it('freezes exact evidence at approval and rejects sources added afterward', async () => {
    const {
      service,
      assets,
      workbench,
      approvedAssetRef,
      approvedAssetEvidenceId,
    } = await fixture();
    const approvedSources = await service.sources(owner, now);
    expect(approvedSources.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'text_asset',
        ref: approvedAssetRef,
        evidenceIds: [approvedAssetEvidenceId],
      }),
    ]));

    const approvedAssetDraft = await service.create({
      actorId: owner,
      requestId: 'draft_from_approved_asset',
      sourceKind: 'text_asset',
      sourceRef: approvedAssetRef,
      channel: 'newsletter',
      narrativeAngle: 'چطور شفافیت کیفیت یک تصمیم دشوار را بالا می‌برد؟',
      takeaway: 'اعتماد از ادعای بزرگ نه، از تجربه قابل‌ردیابی ساخته می‌شود.',
      publicDraftingConsent: true,
      occurredAt: now,
    });
    expect(approvedAssetDraft).toMatchObject({
      snapshot: { source: { kind: 'text_asset', ref: approvedAssetRef } },
    });
    await assets.applyRight({
      actorId: owner,
      requestId: 'asset_draft_revoke_approved',
      assetId: approvedAssetRef,
      operation: 'revoke_brand_usage',
      reason: 'این منبع دیگر برای تحلیل برند استفاده نشود.',
      occurredAt: new Date(now.getTime() + 500),
    });
    expect((await service.sources(owner, new Date(now.getTime() + 500))).records).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: approvedAssetRef })]),
    );
    await expect(service.approve({
      actorId: owner,
      requestId: 'draft_approve_after_asset_revoke',
      draftId: approvedAssetDraft.snapshot.draftId,
      expectedRevision: approvedAssetDraft.snapshot.revision,
      occurredAt: new Date(now.getTime() + 500),
    })).rejects.toMatchObject({ reason: 'source_not_available' });

    const later = await assets.importText({
      actorId: owner,
      requestId: 'asset_draft_after_approval',
      title: 'یادداشت جدید پس از تأیید',
      content: 'این منبع بعد از تأیید اقدام محتوایی اضافه شده و نباید به‌صورت ضمنی وارد همان اقدام شود.',
      assertionText: 'این تجربه بعد از تأیید اقدام ثبت شده است.',
      occurredAt: new Date(now.getTime() + 1_000),
      importedAt: new Date(now.getTime() + 1_000),
      permissions: { personalUnderstanding: true, brandUsage: true },
    });
    await assets.importText({
      actorId: owner,
      requestId: 'asset_draft_without_brand_consent',
      title: 'یادداشت فقط برای شناخت شخصی',
      content: 'این یادداشت رضایت استفاده در برند ندارد و نباید در کاتالوگ منبع Draft نمایش داده شود.',
      assertionText: 'این منبع فقط برای شناخت شخصی مجاز است.',
      occurredAt: new Date(now.getTime() + 2_000),
      importedAt: new Date(now.getTime() + 2_000),
      permissions: { personalUnderstanding: true, brandUsage: false },
    });

    const sourcesAfterApproval = await service.sources(owner, new Date(now.getTime() + 3_000));
    expect(sourcesAfterApproval.records.some((source) => source.ref === later.record.assetId)).toBe(true);
    expect(sourcesAfterApproval.records.some((source) => source.ref === 'asset_asset_draft_without_brand_consent')).toBe(false);
    const frozen = await workbench.snapshot();
    expect(frozen.workflow.approvedEvidenceIds).toContain(approvedAssetEvidenceId);
    expect(frozen.workflow.approvedEvidenceIds).not.toContain(later.record.evidenceId);

    await expect(service.create({
      actorId: owner,
      requestId: 'draft_from_late_asset',
      sourceKind: 'text_asset',
      sourceRef: later.record.assetId,
      channel: 'linkedin',
      narrativeAngle: 'این منبع نباید بدون تأیید تازه استفاده شود',
      takeaway: 'Evidence جدید به Approval قدیمی سرایت نمی‌کند.',
      publicDraftingConsent: true,
      occurredAt: new Date(now.getTime() + 3_000),
    })).rejects.toMatchObject({ reason: 'source_not_authorized_for_action' });
  });

  it('blocks approval when an edit removes a required platform element', async () => {
    const { service, proposalId } = await fixture();
    const created = await service.create({
      actorId: owner,
      requestId: 'draft_youtube_create',
      sourceKind: 'memory',
      sourceRef: proposalId,
      channel: 'youtube',
      narrativeAngle: 'یک روایت ویدیویی درباره تصمیم شفاف',
      takeaway: 'نشانه‌های بصری باید به تجربه واقعی متصل بمانند.',
      publicDraftingConsent: true,
      occurredAt: now,
    });

    const edited = await service.edit({
      actorId: owner,
      requestId: 'draft_youtube_remove_visual',
      draftId: created.snapshot.draftId,
      expectedRevision: created.snapshot.revision,
      body: created.snapshot.body.replace('راهنمای تصویر', 'بخش دوم'),
      occurredAt: now,
    });

    expect(edited.snapshot).toMatchObject({
      status: 'guard_failed',
      guard: {
        classification: 'red',
        violations: [expect.objectContaining({ code: 'channel_format_violation' })],
      },
    });
  });

  it('records an edit as owner feedback without auto-applying a preference', async () => {
    const { service, learning, proposalId } = await fixture();
    const created = await service.create({
      actorId: owner,
      requestId: 'draft_feedback_create',
      sourceKind: 'memory',
      sourceRef: proposalId,
      channel: 'linkedin',
      narrativeAngle: 'یک تیتر طولانی برای ثبت الگوی ویرایش کاربر',
      takeaway: 'یک برداشت شخصی و قابل‌ردیابی که برای آزمون به اندازه کافی توضیح دارد. '.repeat(8),
      publicDraftingConsent: true,
      occurredAt: now,
    });
    await service.edit({
      actorId: owner,
      requestId: 'draft_feedback_edit',
      draftId: created.snapshot.draftId,
      expectedRevision: created.snapshot.revision,
      body: `تیتر کوتاه\n\n${created.snapshot.source.statement}\n\nیک برداشت کوتاه و صادقانه.`,
      occurredAt: now,
    });
    const feedback = await learning.snapshot(owner, now);
    expect(feedback.recentEvents.some((event) => event.eventType === 'edited')).toBe(true);
    expect(feedback.summary.applied).toBe(0);
  });
});

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
  public transactions = 0;
  public constructor(public readonly sql: RecordingTransaction) {}
  public async transaction<Result>(operation: (transaction: SqlTransaction) => Promise<Result>): Promise<Result> {
    this.transactions += 1;
    return operation(this.sql);
  }
}

describe('Postgres draft workspace repository', () => {
  it('creates consent, verified claim, evidence links, draft, audit and outbox atomically', async () => {
    const evidence = '33333333-3333-4333-8333-333333333333';
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [{ client_ref: 'draft_pg_create' }], rowCount: 1 },
      { rows: [{ assertion_id: '44444444-4444-4444-8444-444444444444', assertion_value: 'یک تجربه واقعی', evidence_ids: [evidence] }], rowCount: 1 },
      ...Array.from({ length: 8 }, () => ({ rows: [], rowCount: 1 })),
    ]);
    const runner = new RecordingRunner(sql);
    const repository = new PostgresDraftWorkspaceRepository(runner, {
      tenantId: tenant,
      ownerUserId: owner,
    });
    const command: CreateDraftCommand = {
      tenantId: tenant,
      actorId: owner,
      requestId: 'draft_pg_create',
      occurredAt: now,
      draftId: '55555555-5555-4555-8555-555555555555',
      claimId: '66666666-6666-4666-8666-666666666666',
      strategyRevision: 1,
      channel: 'linkedin',
      body: 'زاویه روایت\n\nیک تجربه واقعی\n\nبرداشت من',
      adaptationProfileVersion: platformAdaptationProfileVersion,
      guard: { classification: 'green', mayRequestApproval: true, violations: [] },
      source: {
        kind: 'memory',
        ref: 'memory_pg_source',
        label: 'یک تجربه واقعی',
        assertionId: '44444444-4444-4444-8444-444444444444',
        statement: 'یک تجربه واقعی',
        evidenceIds: [evidence],
        sourceTypes: ['conversation_turn'],
      },
    };

    await expect(repository.create(command)).resolves.toMatchObject({
      outcome: 'applied', snapshot: { status: 'awaiting_approval' },
    });
    expect(runner.transactions).toBe(1);
    expect(sql.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(sql.queries.some((query) => query.sql.includes('app.consent_grants'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.claims'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.claim_evidence'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.draft_artifacts'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.outbox_events'))).toBe(true);
  });
});
