import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type QueryResultRow } from 'pg';
import {
  DecisionArbitrationService,
  PostgresArbitrationRepository,
} from '../src/arbitration/decision-arbitration.js';
import {
  InitiativePolicyService,
  PostgresInitiativeRepository,
} from '../src/initiative/initiative-policy.js';
import {
  applyMigrations,
  type MigrationConnection,
} from '../src/database/migration-runner.js';
import type { SqlQueryResult } from '../src/database/sql.js';
import { PostgresRuntime } from '../src/database/postgres.js';
import { PostgresStrategicQualityRepository } from '../src/database/postgres-strategic-quality.js';
import {
  StrategicQualityConflictError,
  StrategicQualityService,
} from '../src/evaluation/strategic-quality.js';
import { defineMigration } from '../src/kernel/migrations.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  DecisionContextService,
  PostgresDecisionContextRepository,
  defaultDecisionContext,
} from '../src/strategy/decision-context.js';
import {
  PerceptionConflictError,
  PerceptionWorkspaceService,
  PostgresPerceptionWorkspaceRepository,
} from '../src/perception/workspace.js';
import {
  PostgresRelationshipWorkspaceRepository,
  RelationshipConflictError,
  RelationshipWorkspaceService,
} from '../src/relationships/workspace.js';
import { ConversationIntakeService } from '../src/conversation/intake.js';
import { PostgresConversationMemoryRepository } from '../src/conversation/repository.js';
import {
  BrandProtectionService,
  PostgresRiskReviewRepository,
  assessAction,
} from '../src/risk/brand-protection.js';
import type { WorkbenchAction, WorkbenchSnapshot } from '../src/workbench/workbench.js';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const applicationRolePassword = 'pr_app_test_password';
const integrationAttentionBudget: WorkbenchSnapshot['attentionBudget'] = {
  availableMinutes: 150, maximumEnergyCost: 3, attentionCapacity: 3,
  visibilityTolerance: 4, emotionalBandwidth: 3,
};

function integrationDecisionContext(at: Date): WorkbenchSnapshot['decisionContext'] {
  return {
    policyVersion: 'decision-context-v1', revision: 1, contextHash: 'a'.repeat(64),
    updatedAt: at.toISOString(), persistence: 'postgres', attentionBudget: integrationAttentionBudget,
  };
}

function integrationDecision(
  kind: WorkbenchAction['kind'],
  at: Date,
): WorkbenchAction['decision'] {
  const expiresAt = new Date(at.getTime() + 86400000).toISOString();
  const formats: Readonly<Record<WorkbenchAction['kind'], WorkbenchAction['decision']['format']>> = {
    no_action: 'none', private_conversation: 'private_conversation', relationship: 'relationship_action',
    content: 'mother_concept', media: 'media_response', event: 'event_participation', research: 'research_brief',
  };
  return {
    policyVersion: 'strategic-decision-v1', strategyRevision: 1,
    decisionContextRevision: 1, decisionContextHash: 'a'.repeat(64),
    objective: 'تعامل عمیق', stakeholder: 'تصمیم‌گیران',
    posture: kind === 'no_action' ? 'delay' : 'now', timingRationale: 'Integration fixture.',
    decisionWindowEndsAt: expiresAt,
    format: formats[kind],
    platformSelected: false, assumptions: ['Evidence مجاز است.'], uncertainty: ['نتیجه هنوز مشاهده نشده است.'],
    feasibilityReasons: ['within_budget'], requiredApproval: 'human',
    measurementPlan: { signals: ['کیفیت تعامل'], reviewAfter: expiresAt },
    boundaries: { recommendationIsExecution: false, publicApprovalGranted: false, externalActionPermitted: false },
  };
}

function integrationDecisionFrame(at: Date): WorkbenchSnapshot['decisionFrame'] {
  return {
    policyVersion: 'strategic-decision-v1', why: { goalId: 'integration-goal', objective: 'تعامل عمیق' },
    forWhom: 'تصمیم‌گیران', currentContext: integrationAttentionBudget,
    contextBinding: {
      strategyRevision: 1, decisionContextRevision: 1,
      decisionContextHash: 'a'.repeat(64), decisionContextUpdatedAt: at.toISOString(),
    },
    decisionWindow: { generatedAt: at.toISOString(), expiresAt: new Date(at.getTime() + 86400000).toISOString(), durationHours: 24 },
    rankingTransparency: {
      method: 'declared_weighted_policy', dimensions: ['benefit', 'strategic_fit', 'risk', 'reversibility', 'confidence', 'attention'],
      utilityScoreVisible: true, opportunityCostVisible: true, hiddenScoreUsed: false,
    },
    boundaries: { platformConstrained: false, publicApprovalGranted: false, externalActionPermitted: false },
  };
}

class PgMigrationConnection implements MigrationConnection {
  public constructor(private readonly client: Client) {}

  public async query<Row>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query<QueryResultRow>(sql, [...values]);
    return {
      rows: result.rows as unknown as readonly Row[],
      rowCount: result.rowCount ?? 0,
    };
  }
}

async function main(): Promise<void> {
  const connectionString = requiredEnvironment('PR_TEST_ADMIN_DATABASE_URL');
  const client = new Client({ connectionString, application_name: 'wealthos-pr-integration' });
  await client.connect();
  try {
    const migrations = readdirSync(resolve('db/migrations'))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort()
      .map((name) => defineMigration(name.replace(/\.sql$/u, ''), readFileSync(resolve('db/migrations', name), 'utf8')));
    const migrationResult = await applyMigrations(new PgMigrationConnection(client), migrations);
    if (migrationResult.applied.length + migrationResult.alreadyApplied.length !== migrations.length) {
      throw new Error('Not every migration was accounted for.');
    }

    await createApplicationRole(client);
    await seedIsolationFixtures(client);
    await verifyTenantPolicies(client);
    await verifyRuntimeIsolation(client);
    await verifyDecisionContextPersistence();
    await verifyStrategicQualityPersistence();
    await verifyBrandRiskPersistence();
    await verifyConversationOrchestrationPersistence();
    await verifyArbitrationPersistence();
    await verifyInitiativePersistence();
    await verifyRelationshipPersistence();
    await verifyPerceptionPersistence();
    await verifyRuntimeReadiness(connectionString);
    process.stdout.write(
      `PostgreSQL integration passed (${String(migrations.length)} migrations, RLS enforced).\n`,
    );
  } finally {
    await client.end();
  }
}

async function verifyStrategicQualityPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const activeTenant = tenantId(tenantA);
  const at = new Date('2026-09-01T03:00:00.000Z');
  const action: WorkbenchAction = {
    id: 'quality_integration_action', kind: 'relationship', title: 'مرور یک رابطه کلیدی',
    rationale: 'تصمیم تستی متصل به Context.', benefits: ['وضوح'], risks: ['برداشت نادرست'],
    prerequisites: ['مرور انسانی'], evidenceIds: ['quality_evidence'], evidenceCount: 1,
    confidence: 0.8, riskLevel: 'low', attentionCostMinutes: 20, energyCost: 1,
    attentionDemand: 1, visibilityCost: 1, emotionalCost: 1,
    feasible: true, feasibilityReasons: ['within_budget'], utilityScore: 50,
    opportunityCost: 0, rank: 1, evidenceState: 'grounded', evidenceSourceTypes: ['text_asset'],
    interaction: 'approve', decision: integrationDecision('relationship', at),
  };
  const workbenchSnapshot: WorkbenchSnapshot = {
    policyVersion: 'strategic-decision-v1', generatedAt: at.toISOString(),
    runtime: { source: 'node_api', persistence: 'postgres' },
    profile: { maturityPercent: 20, evidenceCount: 1, openContradictions: 0 },
    goal: {
      id: 'quality-goal', revision: 1, title: 'اعتماد', outcome: 'تعامل عمیق',
      successMetrics: ['کیفیت تعامل'],
    },
    attentionBudget: integrationAttentionBudget,
    decisionContext: integrationDecisionContext(at),
    decisionFrame: integrationDecisionFrame(at),
    evidence: {
      state: 'grounded', strategyEvidenceCount: 1, withheldEvidenceCount: 0,
      sourceTypes: ['text_asset'],
    },
    actions: [action],
    workflow: { id: 'workbench_today', status: 'awaiting_approval', revision: 1 },
  };
  const service = new StrategicQualityService(
    new PostgresStrategicQualityRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
    { snapshot: () => Promise.resolve(workbenchSnapshot) },
  );
  const command = {
    actorId: owner,
    requestId: 'strategic_quality_integration_one',
    actionId: action.id,
    decision: 'rejected' as const,
    usefulness: 4,
    trust: 3,
    friction: 2,
    note: 'نیاز به Context بیشتری دارد.',
    expectedStrategyRevision: 1,
    expectedDecisionContextRevision: 1,
    expectedDecisionContextHash: 'a'.repeat(64),
    expectedDecisionWindowEndsAt: action.decision.decisionWindowEndsAt,
    reviewedAt: at,
  };
  try {
    const recorded = await service.review(command);
    const replayed = await service.review(command);
    let mismatchRejected = false;
    try {
      await service.review({ ...command, usefulness: 5 });
    } catch (error: unknown) {
      mismatchRejected = error instanceof StrategicQualityConflictError &&
        error.reason === 'idempotency_mismatch';
    }
    if (
      recorded.persistence !== 'postgres' || recorded.ownerBaseline.sampleSize !== 1 ||
      replayed.recentReviews.length !== 1 || !mismatchRejected
    ) throw new Error('Strategic quality persistence or idempotency contract failed.');
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        reviews: string | number;
        requests: string | number;
        completed_requests: boolean;
        audit_events: string | number;
        minimal_audit: boolean;
      }>>(
        `SELECT
           (SELECT count(*) FROM app.strategic_recommendation_reviews
             WHERE tenant_id = $1 AND owner_user_id = $2) AS reviews,
           (SELECT count(*) FROM app.strategic_review_requests
             WHERE tenant_id = $1 AND owner_user_id = $2) AS requests,
           (SELECT bool_and(review_id IS NOT NULL) FROM app.strategic_review_requests
             WHERE tenant_id = $1 AND owner_user_id = $2) AS completed_requests,
           (SELECT count(*) FROM app.audit_events
             WHERE tenant_id = $1 AND event_type = 'strategic_recommendation.rejected') AS audit_events,
           (SELECT bool_and(NOT (metadata ?| ARRAY['actionTitle', 'note'])) FROM app.audit_events
             WHERE tenant_id = $1 AND event_type = 'strategic_recommendation.rejected') AS minimal_audit`,
        [tenantA, userA],
      );
      const row = stored.rows[0];
      if (!row) throw new Error('Stored strategic review verification row is missing.');
      if (
        Number(row.reviews) !== 1 || Number(row.requests) !== 1 || !row.completed_requests ||
        Number(row.audit_events) !== 1 || !row.minimal_audit
      ) throw new Error('Stored strategic review, request journal or audit trail is incomplete.');
    });
  } finally {
    await runtime.close();
  }
}

async function verifyDecisionContextPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const activeTenant = tenantId(tenantA);
  const at = new Date('2026-08-31T22:40:00.000Z');
  const service = new DecisionContextService(
    new PostgresDecisionContextRepository(
      runtime,
      { tenantId: tenantA, ownerUserId: userA, workflowId: 'workbench_today' },
      defaultDecisionContext(),
    ),
    { tenantId: activeTenant, ownerUserId: owner },
  );
  try {
    const result = await service.save({
      actorId: owner,
      requestId: 'decision_context_integration_v1',
      expectedRevision: 1,
      value: {
        attentionBudget: {
          availableMinutes: 90,
          maximumEnergyCost: 2,
          attentionCapacity: 2,
          visibilityTolerance: 3,
          emotionalBandwidth: 2,
        },
      },
      occurredAt: at,
    });
    if (result.snapshot.revision !== 2 || result.snapshot.persistence !== 'postgres') {
      throw new Error('Decision context persistence did not return revision 2.');
    }
    const current = await service.snapshot(owner);
    if (
      current.contextHash !== result.snapshot.contextHash ||
      current.attentionBudget.attentionCapacity !== 2
    ) throw new Error('Decision context state or hash did not round-trip.');
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        revision: string | number;
        attention_capacity: string | number;
        audit_count: string | number;
      }>>(
        `SELECT s.revision, s.attention_capacity,
                (SELECT count(*) FROM app.audit_events
                  WHERE tenant_id = $1 AND event_type = 'decision.context_saved') AS audit_count
           FROM app.decision_context_states s
          WHERE s.tenant_id = $1 AND s.owner_user_id = $2`,
        [tenantA, userA],
      );
      const row = stored.rows[0];
      if (
        Number(row?.revision) !== 2 || Number(row?.attention_capacity) !== 2 ||
        Number(row?.audit_count) < 1
      ) throw new Error('Stored Decision Context or audit evidence is incomplete.');
    });
  } finally {
    await runtime.close();
  }
}

async function verifyPerceptionPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const activeTenant = tenantId(tenantA);
  const at = new Date('2026-09-01T02:10:00.000Z');
  const service = new PerceptionWorkspaceService(
    new PostgresPerceptionWorkspaceRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
  );
  const createCommand = {
    actorId: owner,
    requestId: 'perception_integration_create',
    dimension: 'trust' as const,
    perspective: 'external_perception' as const,
    stage: 'visible' as const,
    summary: 'اعتماد در تعامل حرفه‌ای به‌صورت کیفی دیده شده است.',
    evidenceNote: 'خلاصه‌ی بدون هویت از بازخورد مستقیم و با اجازه‌ی ثبت.',
    sourceKind: 'direct_feedback' as const,
    confidence: 'medium' as const,
    observedAt: new Date('2026-08-20T02:10:00.000Z'),
    consentConfirmed: true,
    occurredAt: at,
  };
  try {
    const created = await service.create(createCommand);
    const replay = await service.create(createCommand);
    const beforeDelete = await service.snapshot(owner, at);
    if (
      created.outcome !== 'applied' || replay.outcome !== 'already_applied' ||
      replay.record.signalId !== created.record.signalId ||
      beforeDelete.summary.totalSignals !== 1 ||
      beforeDelete.signals[0]?.epistemicType !== 'external_perception'
    ) {
      throw new Error('Perception persistence, epistemic or privacy contract failed.');
    }
    const deleteCommand = {
      actorId: owner,
      requestId: 'perception_integration_delete',
      signalId: created.record.signalId,
      occurredAt: new Date(at.getTime() + 1_000),
    } as const;
    const deleted = await service.delete(deleteCommand);
    const deleteReplay = await service.delete(deleteCommand);
    const afterDelete = await service.snapshot(owner, new Date(at.getTime() + 2_000));
    let retiredCreateRejected = false;
    try {
      await service.create(createCommand);
    } catch (error: unknown) {
      retiredCreateRejected = error instanceof PerceptionConflictError;
    }
    if (
      deleted.outcome !== 'deleted' || deleteReplay.outcome !== 'already_applied' ||
      afterDelete.summary.totalSignals !== 0 || !retiredCreateRejected
    ) {
      throw new Error('Perception hard delete or retired request contract failed.');
    }
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        active_records: string | number;
        requests: string | number;
        minimal_requests: boolean;
        audit_events: string | number;
        minimal_audit: boolean;
      }>>(
        `SELECT
           (SELECT count(*) FROM app.perception_signals
             WHERE tenant_id = $1 AND owner_user_id = $2) AS active_records,
           (SELECT count(*) FROM app.perception_requests
             WHERE tenant_id = $1 AND owner_user_id = $2) AS requests,
           (SELECT bool_and(
              jsonb_typeof(result_snapshot->'signalId') = 'string' AND
              result_snapshot = jsonb_build_object('signalId', result_snapshot->'signalId')
            )
              FROM app.perception_requests
             WHERE tenant_id = $1 AND owner_user_id = $2) AS minimal_requests,
           (SELECT count(*) FROM app.audit_events
             WHERE tenant_id = $1 AND resource_id = $3
               AND event_type IN ('perception.signal_recorded', 'perception.signal_deleted')) AS audit_events,
           (SELECT bool_and(NOT (metadata ?| ARRAY[
              'dimension', 'perspective', 'stage', 'summary', 'evidenceNote', 'sourceKind', 'confidence'
            ]))
              FROM app.audit_events
             WHERE tenant_id = $1 AND resource_id = $3
               AND event_type IN ('perception.signal_recorded', 'perception.signal_deleted')) AS minimal_audit`,
        [tenantA, userA, created.record.signalId],
      );
      const row = stored.rows[0];
      if (!row) throw new Error('Stored perception verification row is missing.');
      if (
        Number(row.active_records) !== 0 || Number(row.requests) !== 2 ||
        !row.minimal_requests || Number(row.audit_events) !== 2 || !row.minimal_audit
      ) {
        throw new Error('Stored perception hard-delete journal or audit trail is incomplete.');
      }
    });
  } finally {
    await runtime.close();
  }
}

async function verifyRelationshipPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const activeTenant = tenantId(tenantA);
  const at = new Date('2026-09-01T02:00:00.000Z');
  const service = new RelationshipWorkspaceService(
    new PostgresRelationshipWorkspaceRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
  );
  const createCommand = {
    actorId: owner,
    requestId: 'relationship_integration_create',
    label: 'همکار Integration خصوصی',
    group: 'peer' as const,
    outcome: 'حفظ اعتماد در همکاری بلندمدت',
    priority: 'high' as const,
    strength: 'trusted' as const,
    boundary: 'normal' as const,
    contextNote: 'این Context حساس فقط تا زمان درخواست حذف در رکورد فعال باقی می‌ماند.',
    lastInteractionAt: new Date('2026-04-01T02:00:00.000Z'),
    consentConfirmed: true,
    occurredAt: at,
  };
  try {
    const created = await service.create(createCommand);
    const replay = await service.create(createCommand);
    const beforeDelete = await service.snapshot(owner, at);
    if (
      created.outcome !== 'applied' || replay.outcome !== 'already_applied' ||
      replay.record.stakeholderId !== created.record.stakeholderId ||
      beforeDelete.summary.totalStakeholders !== 1 ||
      beforeDelete.stakeholders[0]?.attention !== 'review_context'
    ) {
      throw new Error('Relationship persistence, privacy or idempotency contract failed.');
    }
    const deleteCommand = {
      actorId: owner,
      requestId: 'relationship_integration_delete',
      stakeholderId: created.record.stakeholderId,
      occurredAt: new Date(at.getTime() + 1_000),
    } as const;
    const deleted = await service.delete(deleteCommand);
    const deleteReplay = await service.delete(deleteCommand);
    const afterDelete = await service.snapshot(owner, new Date(at.getTime() + 2_000));
    let retiredCreateRejected = false;
    try {
      await service.create(createCommand);
    } catch (error: unknown) {
      retiredCreateRejected = error instanceof RelationshipConflictError;
    }
    if (
      deleted.outcome !== 'deleted' || deleteReplay.outcome !== 'already_applied' ||
      afterDelete.summary.totalStakeholders !== 0 || !retiredCreateRejected
    ) {
      throw new Error('Relationship hard delete or retired request contract failed.');
    }
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        active_records: string | number;
        requests: string | number;
        minimal_requests: boolean;
        audit_events: string | number;
        minimal_audit: boolean;
      }>>(
        `SELECT
           (SELECT count(*) FROM app.stakeholder_records
             WHERE tenant_id = $1 AND owner_user_id = $2) AS active_records,
           (SELECT count(*) FROM app.stakeholder_requests
             WHERE tenant_id = $1 AND owner_user_id = $2) AS requests,
           (SELECT bool_and(
              jsonb_typeof(result_snapshot->'stakeholderId') = 'string' AND
              result_snapshot = jsonb_build_object('stakeholderId', result_snapshot->'stakeholderId')
            )
              FROM app.stakeholder_requests
             WHERE tenant_id = $1 AND owner_user_id = $2) AS minimal_requests,
           (SELECT count(*) FROM app.audit_events
             WHERE tenant_id = $1 AND resource_id = $3
               AND event_type IN ('relationship.stakeholder_recorded', 'relationship.stakeholder_deleted')) AS audit_events,
           (SELECT bool_and(NOT (metadata ?| ARRAY['label', 'group', 'priority', 'boundary', 'contextNote']))
              FROM app.audit_events
             WHERE tenant_id = $1 AND resource_id = $3
               AND event_type IN ('relationship.stakeholder_recorded', 'relationship.stakeholder_deleted')) AS minimal_audit`,
        [tenantA, userA, created.record.stakeholderId],
      );
      const row = stored.rows[0];
      if (!row) throw new Error('Stored relationship verification row is missing.');
      if (
        Number(row.active_records) !== 0 || Number(row.requests) !== 2 ||
        !row.minimal_requests || Number(row.audit_events) !== 2 || !row.minimal_audit
      ) {
        throw new Error('Stored relationship hard-delete journal or audit trail is incomplete.');
      }
    });
  } finally {
    await runtime.close();
  }
}

async function verifyInitiativePersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const activeTenant = tenantId(tenantA);
  const at = new Date('2026-09-01T01:30:00.000Z');
  const action: WorkbenchAction = {
    id: 'initiative_integration_collect', kind: 'research', title: 'ثبت تجربه واقعی',
    rationale: 'یک سؤال کوتاه برای کاهش حدس در مدل شخصی.',
    benefits: ['وضوح'], risks: ['مزاحمت'], prerequisites: ['رضایت مالک'],
    evidenceIds: [], evidenceCount: 0, confidence: 0.3,
    riskLevel: 'low', attentionCostMinutes: 10, energyCost: 1, attentionDemand: 1,
    visibilityCost: 1, emotionalCost: 1,
    feasible: true, feasibilityReasons: ['within_budget'],
    utilityScore: 40, opportunityCost: 1, rank: 1, evidenceState: 'insufficient',
    evidenceSourceTypes: [], interaction: 'open_intake',
    decision: integrationDecision('research', at),
  };
  const workbenchSnapshot: WorkbenchSnapshot = {
    policyVersion: 'strategic-decision-v1',
    generatedAt: at.toISOString(),
    runtime: { source: 'node_api', persistence: 'postgres' },
    profile: { maturityPercent: 0, evidenceCount: 0, openContradictions: 0 },
    goal: {
      id: 'initiative-goal', revision: 1, title: 'اعتماد', outcome: 'تعامل عمیق',
      successMetrics: ['کیفیت'],
    },
    attentionBudget: integrationAttentionBudget,
    decisionContext: integrationDecisionContext(at),
    decisionFrame: integrationDecisionFrame(at),
    evidence: {
      state: 'insufficient', strategyEvidenceCount: 0, withheldEvidenceCount: 0, sourceTypes: [],
    },
    actions: [action],
    workflow: { id: 'workbench_today', status: 'awaiting_approval', revision: 1 },
  };
  const workbench = { snapshot: () => Promise.resolve(workbenchSnapshot) };
  const risk = new BrandProtectionService(
    new PostgresRiskReviewRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
  );
  const arbitration = new DecisionArbitrationService(
    new PostgresArbitrationRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
    { workbench, risk },
  );
  const service = new InitiativePolicyService(
    new PostgresInitiativeRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
    { workbench, arbitration },
  );
  try {
    const settings = await service.updateSettings({
      actorId: owner,
      requestId: 'initiative_integration_settings',
      expectedRevision: 1,
      value: {
        mode: 'balanced',
        maxPromptsPer24Hours: 1,
        minimumRelevance: 0.75,
        pausedUntil: null,
      },
      occurredAt: at,
    });
    const request = {
      actorId: owner,
      requestId: 'initiative_integration_eval',
      occurredAt: new Date(at.getTime() + 1_000),
    } as const;
    const first = await service.evaluate(request);
    const replay = await service.evaluate(request);
    const limited = await service.evaluate({
      actorId: owner,
      requestId: 'initiative_integration_limited',
      occurredAt: new Date(at.getTime() + 2_000),
    });
    if (
      settings.outcome !== 'saved' || settings.settings.revision !== 2 ||
      first.outcome !== 'evaluated' || first.evaluation.decision !== 'delivered' ||
      replay.outcome !== 'already_evaluated' ||
      limited.evaluation.reason !== 'rate_limited'
    ) {
      throw new Error('Initiative persistence, idempotency or rate-limit contract failed.');
    }
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        mode: string;
        revision: string | number;
        delivered: string | number;
        suppressed: string | number;
      }>>(
        `SELECT s.mode, s.revision,
                count(*) FILTER (WHERE e.decision = 'delivered') AS delivered,
                count(*) FILTER (WHERE e.decision = 'suppressed') AS suppressed
           FROM app.initiative_settings s
           LEFT JOIN app.initiative_evaluations e
             ON e.tenant_id = s.tenant_id AND e.owner_user_id = s.owner_user_id
          WHERE s.tenant_id = $1 AND s.owner_user_id = $2
          GROUP BY s.mode, s.revision`,
        [tenantA, userA],
      );
      const row = stored.rows[0];
      if (
        row?.mode !== 'balanced' || Number(row.revision) !== 2 ||
        Number(row.delivered) !== 1 || Number(row.suppressed) !== 1
      ) {
        throw new Error('Stored initiative settings or evaluation ledger is incomplete.');
      }
    });
  } finally {
    await runtime.close();
  }
}

async function verifyArbitrationPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const activeTenant = tenantId(tenantA);
  const at = new Date('2026-08-31T22:48:00.000Z');
  const action: WorkbenchAction = {
    id: 'arbitration_integration_action', kind: 'content', title: 'اقدام Arbitration Integration',
    rationale: 'یک اقدام مستند که باید از قرارداد بین‌ماژولی عبور کند.',
    benefits: ['اعتماد'], risks: ['برداشت نادرست'], prerequisites: ['Claim Check'],
    evidenceIds: ['integration-evidence'], evidenceCount: 1, confidence: 0.79,
    riskLevel: 'medium', attentionCostMinutes: 20, energyCost: 2, attentionDemand: 2,
    visibilityCost: 3, emotionalCost: 2,
    feasible: true, feasibilityReasons: ['within_budget'],
    utilityScore: 69, opportunityCost: 1, rank: 1, evidenceState: 'grounded',
    evidenceSourceTypes: ['text_asset'], interaction: 'approve',
    decision: integrationDecision('content', at),
  };
  const workbenchSnapshot: WorkbenchSnapshot = {
    policyVersion: 'strategic-decision-v1',
    generatedAt: at.toISOString(),
    runtime: { source: 'node_api', persistence: 'postgres' },
    profile: { maturityPercent: 20, evidenceCount: 1, openContradictions: 0 },
    goal: {
      id: 'integration-goal', revision: 1, title: 'اعتماد', outcome: 'تعامل عمیق',
      successMetrics: ['کیفیت'],
    },
    attentionBudget: integrationAttentionBudget,
    decisionContext: integrationDecisionContext(at),
    decisionFrame: integrationDecisionFrame(at),
    evidence: {
      state: 'grounded', strategyEvidenceCount: 1, withheldEvidenceCount: 0,
      sourceTypes: ['text_asset'],
    },
    actions: [action],
    workflow: { id: 'workbench_today', status: 'awaiting_approval', revision: 2 },
  };
  const risk = new BrandProtectionService(
    new PostgresRiskReviewRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
  );
  const service = new DecisionArbitrationService(
    new PostgresArbitrationRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    { tenantId: activeTenant, ownerUserId: owner },
    { workbench: { snapshot: () => Promise.resolve(workbenchSnapshot) }, risk },
  );
  const request = {
    actorId: owner,
    requestId: 'arbitration_integration_v1',
    actionId: action.id,
    requestedAutonomyLevel: 7,
    occurredAt: at,
  } as const;
  try {
    const first = await service.assess(request);
    const replay = await service.assess(request);
    if (
      first.outcome !== 'applied' || replay.outcome !== 'already_applied' ||
      first.snapshot.decision.effectiveAutonomyLevel > 5 ||
      first.snapshot.opinions.length !== 5
    ) {
      throw new Error('Arbitration persistence contract was not stable across replay.');
    }
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        policy_version: string;
        requested_autonomy_level: number;
        result_snapshot: Record<string, unknown>;
      }>>(
        `SELECT policy_version, requested_autonomy_level, result_snapshot
           FROM app.arbitration_cases
          WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
        [tenantA, userA, request.requestId],
      );
      const row = stored.rows[0];
      const decision = row?.result_snapshot['decision'];
      if (
        row?.policy_version !== 'intermodule-arbitration-v1' ||
        row.requested_autonomy_level !== 7 ||
        typeof decision !== 'object' || decision === null ||
        (decision as Record<string, unknown>)['executionPermitted'] !== false
      ) {
        throw new Error('Stored arbitration snapshot is incomplete or permits execution.');
      }
    });
  } finally {
    await runtime.close();
  }
}

async function verifyConversationOrchestrationPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const service = new ConversationIntakeService(
    new PostgresConversationMemoryRepository(runtime, {
      tenantId: tenantA,
      ownerUserId: userA,
    }),
  );
  const request = {
    tenantId: tenantId(tenantA),
    actorId: owner,
    conversationId: 'conversation_integration_v1',
    turnId: 'turn_orchestration_v1',
    text: 'امروز در جلسه متوجه شدم که توضیح شفاف، ابهام تصمیم را کمتر می‌کند.',
    proposeMemory: true,
    occurredAt: new Date('2026-08-31T22:47:00.000Z'),
  } as const;
  try {
    const first = await service.submitTurn(request);
    const replay = await service.submitTurn(request);
    if (
      first.orchestration.intent.kind !== 'reflect' ||
      replay.orchestration.route.writeAuthority !== 'propose_only'
    ) {
      throw new Error('Conversation orchestration contract was not stable across replay.');
    }
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        orchestration_snapshot: Record<string, unknown>;
      }>>(
        `SELECT orchestration_snapshot
           FROM app.conversation_turns
          WHERE tenant_id = $1 AND actor_user_id = $2 AND client_ref = $3`,
        [tenantA, userA, request.turnId],
      );
      const snapshot = stored.rows[0]?.orchestration_snapshot;
      if (
        snapshot?.['policyVersion'] !== 'conversation-orchestrator-v1' ||
        JSON.stringify(snapshot).includes(request.text)
      ) {
        throw new Error('Stored orchestration snapshot is missing or duplicates raw user text.');
      }
    });
  } finally {
    await runtime.close();
  }
}

async function verifyBrandRiskPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const context = { tenantId: tenantId(tenantA), ownerUserId: owner };
  const at = new Date('2026-08-31T22:45:00.000Z');
  const service = new BrandProtectionService(
    new PostgresRiskReviewRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    context,
  );
  const action: WorkbenchAction = {
    id: 'integration_public_action', kind: 'content', title: 'یادداشت مستند Integration',
    rationale: 'یک اقدام عمومی مستند که پیامدهای اعتباری آن باید بازبینی شود.',
    benefits: ['اعتماد'], risks: ['برداشت نادرست'], prerequisites: ['Claim Check'],
    evidenceIds: ['integration-evidence'], evidenceCount: 1, confidence: 0.8,
    riskLevel: 'medium', attentionCostMinutes: 20, energyCost: 2, attentionDemand: 2,
    visibilityCost: 3, emotionalCost: 2,
    feasible: true, feasibilityReasons: ['within_budget'],
    utilityScore: 70, opportunityCost: 0, rank: 1, evidenceState: 'grounded',
    evidenceSourceTypes: ['text_asset'], interaction: 'approve',
    decision: integrationDecision('content', at),
  };
  const assessment = assessAction(action);
  try {
    await service.review({
      actorId: owner, action, requestId: 'risk_integration_review',
      expectedLevel: assessment.level, expectedAssessmentHash: assessment.assessmentHash,
      decision: 'acknowledge',
      rationale: 'Risk Review پایگاه داده با Assessment نسخه‌دار و Attestation انسانی تأیید شد.',
      humanAttestation: true, reviewedAt: at,
    });
    await service.authorizeAction(owner, action);
    const snapshot = await service.snapshot(owner, [action], null, new Date('2026-08-31T22:46:00.000Z'));
    if (snapshot.assessments[0]?.gate !== 'allowed_with_acknowledgement') {
      throw new Error('Persisted risk acknowledgement was not effective.');
    }
  } finally {
    await runtime.close();
  }
}

async function createApplicationRole(client: Client): Promise<void> {
  await client.query(`
    DO $$ BEGIN
      CREATE ROLE pr_app_test LOGIN PASSWORD '${applicationRolePassword}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await client.query(`ALTER ROLE pr_app_test LOGIN PASSWORD '${applicationRolePassword}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await client.query('GRANT USAGE ON SCHEMA app TO pr_app_test');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO pr_app_test');
  await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO pr_app_test');
  await client.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO pr_app_test');
  await client.query('GRANT SELECT ON public.pr_schema_migrations TO pr_app_test');
}

async function verifyRuntimeReadiness(adminConnectionString: string): Promise<void> {
  const adminRuntime = new PostgresRuntime(adminConnectionString);
  try {
    const unsafe = await adminRuntime.readiness();
    if (unsafe.ready || unsafe.reason !== 'database_role_unsafe') {
      throw new Error('Runtime did not reject a superuser database principal.');
    }
  } finally {
    await adminRuntime.close();
  }

  const applicationConnectionString = requiredEnvironment('PR_TEST_APP_DATABASE_URL');
  const applicationRuntime = new PostgresRuntime(applicationConnectionString);
  try {
    const safe = await applicationRuntime.readiness();
    if (!safe.ready) throw new Error(`Safe application role was not ready: ${safe.reason ?? 'unknown'}`);
  } finally {
    await applicationRuntime.close();
  }
}

async function seedIsolationFixtures(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO app.tenants (id, slug, display_name) VALUES
       ($1, 'tenant-a', 'Tenant A'), ($2, 'tenant-b', 'Tenant B')
     ON CONFLICT (id) DO NOTHING`,
    [tenantA, tenantB],
  );
  await client.query(
    `INSERT INTO app.users (id, external_subject) VALUES
       ($1, 'owner-a'), ($2, 'owner-b')
     ON CONFLICT (id) DO NOTHING`,
    [userA, userB],
  );
  await client.query(
    `INSERT INTO app.memberships (tenant_id, user_id, role) VALUES
       ($1, $2, 'owner'), ($3, $4, 'owner')
     ON CONFLICT (tenant_id, user_id) DO NOTHING`,
    [tenantA, userA, tenantB, userB],
  );
  await client.query(
    `INSERT INTO app.assets (
       tenant_id, owner_user_id, kind, object_key, content_sha256, data_class
     ) VALUES
       ($1, $2, 'text', 'fixture-a', $3, 'confidential'),
       ($4, $5, 'text', 'fixture-b', $6, 'confidential')
     ON CONFLICT (tenant_id, content_sha256) DO NOTHING`,
    [tenantA, userA, 'a'.repeat(64), tenantB, userB, 'b'.repeat(64)],
  );
  await client.query(
    `INSERT INTO app.audit_events (
       tenant_id, event_type, resource_type, resource_id, decision, metadata
     ) VALUES ($1, 'integration.seeded', 'integration', 'tenant-a', 'allowed', '{}')`,
    [tenantA],
  );
}

async function verifyTenantPolicies(client: Client): Promise<void> {
  const result = await client.query<Readonly<{
    table_name: string;
    row_security: boolean;
    force_row_security: boolean;
    policy_count: number;
  }>>(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS row_security,
           c.relforcerowsecurity AS force_row_security,
           count(p.polname)::integer AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_schema = n.nspname
       AND col.table_name = c.relname
       AND col.column_name = 'tenant_id'
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
     WHERE n.nspname = 'app' AND c.relkind = 'r'
     GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
     ORDER BY c.relname
  `);
  const violations = result.rows.filter(
    (row) => !row.row_security || !row.force_row_security || row.policy_count < 1,
  );
  if (result.rows.length === 0 || violations.length > 0) {
    throw new Error(`Tenant RLS policy violations: ${violations.map((row) => row.table_name).join(',')}`);
  }
}

async function verifyRuntimeIsolation(client: Client): Promise<void> {
  await client.query('SET ROLE pr_app_test');
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantA]);
    const visible = await client.query<Readonly<{ tenant_id: string }>>(
      'SELECT tenant_id::text FROM app.assets ORDER BY tenant_id',
    );
    if (visible.rows.length !== 1 || visible.rows[0]?.tenant_id !== tenantA) {
      throw new Error('Cross-tenant read isolation failed.');
    }
    await expectDenied(
      client.query(
        `INSERT INTO app.assets (
           tenant_id, owner_user_id, kind, object_key, content_sha256, data_class
         ) VALUES ($1, $2, 'text', 'cross-tenant-write', $3, 'confidential')`,
        [tenantB, userB, 'c'.repeat(64)],
      ),
      'Cross-tenant write was not denied.',
    );
    await expectDenied(
      client.query("UPDATE app.audit_events SET decision = 'tampered' WHERE tenant_id = $1", [tenantA]),
      'Audit mutation was not denied.',
    );
    await client.query("SELECT set_config('app.tenant_id', '', false)");
    const withoutTenant = await client.query<Readonly<{ count: string }>>(
      'SELECT count(*)::text AS count FROM app.assets',
    );
    if (withoutTenant.rows[0]?.count !== '0') throw new Error('Missing tenant context did not deny reads.');
  } finally {
    await client.query('RESET ROLE');
  }
}

async function expectDenied(operation: Promise<unknown>, message: string): Promise<void> {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error(message);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'PostgreSQL integration failed.';
  process.stderr.write(`${message}\n`);
  if (process.env['GITHUB_ACTIONS'] === 'true') {
    const annotation = message
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A');
    process.stderr.write(`::error title=PostgreSQL integration::${annotation}\n`);
  }
  process.exitCode = 1;
});
