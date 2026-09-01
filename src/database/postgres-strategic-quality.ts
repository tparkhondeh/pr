import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from './sql.js';
import {
  StrategicQualityConflictError,
  StrategicQualityNotFoundError,
  StrategicQualityPermissionError,
  type StrategicActionOutcome,
  type StrategicOutcomeCommand,
  type StrategicQualityRepository,
  type StrategicRecommendationReview,
  type StrategicReviewCommand,
  outcomeFingerprint,
  reviewFingerprint,
} from '../evaluation/strategic-quality.js';
import type { WorkbenchAction } from '../workbench/workbench.js';

type StrategicReviewRow = Readonly<{
  id: string;
  action_ref: string;
  action_title: string;
  action_kind: WorkbenchAction['kind'];
  action_rank: number;
  decision: StrategicRecommendationReview['decision'];
  usefulness: number;
  trust: number;
  friction: number;
  note: string | null;
  strategy_revision: string | number;
  decision_context_revision: string | number;
  decision_context_sha256: string;
  decision_window_ends_at: Date | string;
  reviewed_at: Date | string;
  supersedes_review_id: string | null;
}>;

type StrategicOutcomeRow = Readonly<{
  id: string;
  review_id: string;
  action_ref: string;
  action_title: string;
  execution_status: StrategicActionOutcome['executionStatus'];
  satisfaction: number;
  regret: number;
  energy: number;
  engagement_quality: number | null;
  interaction_depth: number | null;
  private_messages: number;
  opportunities_created: number;
  relationship_change: StrategicActionOutcome['relationshipChange'];
  media_opportunities: number;
  perception_shift: StrategicActionOutcome['perceptionShift'];
  business_outcome: StrategicActionOutcome['businessOutcome'];
  note: string | null;
  outcome_occurred_at: Date | string;
  recorded_at: Date | string;
  supersedes_outcome_id: string | null;
}>;

export class PostgresStrategicQualityRepository implements StrategicQualityRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public list(): Promise<readonly StrategicRecommendationReview[]> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return this.listWithin(transaction);
    });
  }

  public record(command: StrategicReviewCommand): Promise<readonly StrategicRecommendationReview[]> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = reviewFingerprint(command);
      const request = await transaction.query(
        `INSERT INTO app.strategic_review_requests (
           tenant_id, owner_user_id, request_id, request_sha256, requested_at
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, owner_user_id, request_id) DO NOTHING
         RETURNING request_id`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId, fingerprint, command.reviewedAt],
      );
      if (request.rowCount === 0) {
        const existing = await transaction.query<Readonly<{ request_sha256: string }>>(
          `SELECT request_sha256 FROM app.strategic_review_requests
            WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
          [this.context.tenantId, this.context.ownerUserId, command.requestId],
        );
        if (existing.rows[0]?.request_sha256 !== fingerprint) {
          throw new StrategicQualityConflictError('idempotency_mismatch');
        }
        return this.listWithin(transaction);
      }
      const prior = await transaction.query<Readonly<{ id: string }>>(
        `SELECT id FROM app.strategic_recommendation_reviews
          WHERE tenant_id = $1 AND owner_user_id = $2 AND action_ref = $3
            AND strategy_revision = $4 AND decision_context_revision = $5
            AND decision_context_sha256 = $6
          ORDER BY reviewed_at DESC, id DESC LIMIT 1`,
        [
          this.context.tenantId, this.context.ownerUserId, command.action.id,
          command.strategyRevision, command.decisionContextRevision, command.decisionContextHash,
        ],
      );
      const reviewId = deterministicUuid(
        `strategic-review:${command.tenantId}:${command.actorId}:${command.requestId}`,
      );
      await transaction.query(
        `INSERT INTO app.strategic_recommendation_reviews (
           id, tenant_id, owner_user_id, action_ref, action_title, action_kind, action_rank,
           decision, usefulness, trust, friction, note, strategy_revision,
           decision_context_revision, decision_context_sha256, decision_window_ends_at,
           reviewed_at, supersedes_review_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
         )`,
        [
          reviewId, this.context.tenantId, this.context.ownerUserId, command.action.id,
          command.action.title, command.action.kind, command.action.rank, command.decision,
          command.usefulness, command.trust, command.friction, command.note ?? null,
          command.strategyRevision, command.decisionContextRevision, command.decisionContextHash,
          command.decisionWindowEndsAt, command.reviewedAt, prior.rows[0]?.id ?? null,
        ],
      );
      await transaction.query(
        `UPDATE app.strategic_review_requests SET review_id = $4
          WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId, reviewId],
      );
      await appendAuditEvents(transaction, this.context, command, reviewId);
      return this.listWithin(transaction);
    });
  }

  public listOutcomes(): Promise<readonly StrategicActionOutcome[]> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return this.listOutcomesWithin(transaction);
    });
  }

  public recordOutcome(command: StrategicOutcomeCommand): Promise<readonly StrategicActionOutcome[]> {
    return this.runner.transaction(async (transaction) => {
      this.assertOutcomeContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = outcomeFingerprint(command);
      const request = await transaction.query(
        `INSERT INTO app.strategic_outcome_requests (
           tenant_id, owner_user_id, request_id, request_sha256, requested_at
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, owner_user_id, request_id) DO NOTHING
         RETURNING request_id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.requestId,
          fingerprint,
          command.recordedAt,
        ],
      );
      if (request.rowCount === 0) {
        const existing = await transaction.query<Readonly<{ request_sha256: string }>>(
          `SELECT request_sha256 FROM app.strategic_outcome_requests
            WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
          [this.context.tenantId, this.context.ownerUserId, command.requestId],
        );
        if (existing.rows[0]?.request_sha256 !== fingerprint) {
          throw new StrategicQualityConflictError('idempotency_mismatch');
        }
        return this.listOutcomesWithin(transaction);
      }
      const review = await transaction.query<StrategicReviewRow>(
        `SELECT r.id, r.action_ref, r.action_title, r.action_kind, r.action_rank,
                r.decision, r.usefulness, r.trust, r.friction, r.note,
                r.strategy_revision, r.decision_context_revision,
                r.decision_context_sha256, r.decision_window_ends_at,
                r.reviewed_at, r.supersedes_review_id
           FROM app.strategic_recommendation_reviews r
          WHERE r.tenant_id = $1 AND r.owner_user_id = $2 AND r.id = $3
            AND NOT EXISTS (
              SELECT 1 FROM app.strategic_recommendation_reviews newer
               WHERE newer.tenant_id = r.tenant_id
                 AND newer.owner_user_id = r.owner_user_id
                 AND newer.supersedes_review_id = r.id
            )
          FOR UPDATE OF r`,
        [this.context.tenantId, this.context.ownerUserId, command.review.id],
      );
      const currentReview = review.rows[0];
      if (!currentReview) {
        const existing = await transaction.query<Readonly<{ decision: string }>>(
          `SELECT decision FROM app.strategic_recommendation_reviews
            WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3`,
          [this.context.tenantId, this.context.ownerUserId, command.review.id],
        );
        if (existing.rowCount === 0) throw new StrategicQualityNotFoundError();
        throw new StrategicQualityConflictError('review_superseded');
      }
      if (currentReview.decision !== 'accepted') {
        throw new StrategicQualityConflictError('review_not_accepted');
      }
      if (command.outcomeOccurredAt.getTime() < toDate(currentReview.reviewed_at).getTime()) {
        throw new StrategicQualityConflictError('outcome_before_review');
      }
      const prior = await transaction.query<Readonly<{ id: string }>>(
        `SELECT id FROM app.strategic_action_outcomes
          WHERE tenant_id = $1 AND owner_user_id = $2 AND review_id = $3
          ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [this.context.tenantId, this.context.ownerUserId, command.review.id],
      );
      const outcomeId = deterministicUuid(
        `strategic-outcome:${command.tenantId}:${command.actorId}:${command.requestId}`,
      );
      await transaction.query(
        `INSERT INTO app.strategic_action_outcomes (
           id, tenant_id, owner_user_id, review_id, action_ref, action_title,
           execution_status, satisfaction, regret, energy, engagement_quality,
           interaction_depth, private_messages, opportunities_created,
           relationship_change, media_opportunities, perception_shift,
           business_outcome, note, outcome_occurred_at, recorded_at,
           supersedes_outcome_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
         )`,
        [
          outcomeId,
          this.context.tenantId,
          this.context.ownerUserId,
          command.review.id,
          command.review.actionId,
          command.review.actionTitle,
          command.executionStatus,
          command.satisfaction,
          command.regret,
          command.energy,
          command.engagementQuality ?? null,
          command.interactionDepth ?? null,
          command.privateMessages,
          command.opportunitiesCreated,
          command.relationshipChange,
          command.mediaOpportunities,
          command.perceptionShift,
          command.businessOutcome,
          command.note ?? null,
          command.outcomeOccurredAt,
          command.recordedAt,
          prior.rows[0]?.id ?? null,
        ],
      );
      await transaction.query(
        `UPDATE app.strategic_outcome_requests SET outcome_id = $4
          WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId, outcomeId],
      );
      await appendOutcomeAuditEvents(transaction, this.context, command, outcomeId);
      return this.listOutcomesWithin(transaction);
    });
  }

  private async listWithin(transaction: SqlTransaction): Promise<readonly StrategicRecommendationReview[]> {
    const result = await transaction.query<StrategicReviewRow>(
      `SELECT id, action_ref, action_title, action_kind, action_rank, decision,
              usefulness, trust, friction, note, strategy_revision,
              decision_context_revision, decision_context_sha256,
              decision_window_ends_at, reviewed_at, supersedes_review_id
         FROM app.strategic_recommendation_reviews
        WHERE tenant_id = $1 AND owner_user_id = $2
        ORDER BY reviewed_at DESC, id DESC LIMIT 200`,
      [this.context.tenantId, this.context.ownerUserId],
    );
    return result.rows.map(rowToReview);
  }

  private async listOutcomesWithin(
    transaction: SqlTransaction,
  ): Promise<readonly StrategicActionOutcome[]> {
    const result = await transaction.query<StrategicOutcomeRow>(
      `SELECT id, review_id, action_ref, action_title, execution_status,
              satisfaction, regret, energy, engagement_quality, interaction_depth,
              private_messages, opportunities_created, relationship_change,
              media_opportunities, perception_shift, business_outcome, note,
              outcome_occurred_at, recorded_at, supersedes_outcome_id
         FROM app.strategic_action_outcomes
        WHERE tenant_id = $1 AND owner_user_id = $2
        ORDER BY recorded_at DESC, id DESC LIMIT 200`,
      [this.context.tenantId, this.context.ownerUserId],
    );
    return result.rows.map(rowToOutcome);
  }

  private assertContext(command: StrategicReviewCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new StrategicQualityPermissionError('Strategic review repository context mismatch.');
    }
  }

  private assertOutcomeContext(command: StrategicOutcomeCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new StrategicQualityPermissionError('Strategic outcome repository context mismatch.');
    }
  }
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

async function appendAuditEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: StrategicReviewCommand,
  reviewId: string,
): Promise<void> {
  const eventType = `strategic_recommendation.${command.decision}`;
  const metadata = JSON.stringify({
    requestId: command.requestId,
    actionId: command.action.id,
    strategyRevision: command.strategyRevision,
    decisionContextRevision: command.decisionContextRevision,
    decisionContextHash: command.decisionContextHash,
    usefulness: command.usefulness,
    trust: command.trust,
    friction: command.friction,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, 'strategic_recommendation_review', $4,
       'personal_understanding', $5, $6::jsonb, $7)`,
    [
      context.tenantId, context.ownerUserId, eventType, reviewId,
      command.decision, metadata, command.reviewedAt,
    ],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'strategic_recommendation_review', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, reviewId, eventType, metadata, command.reviewedAt],
  );
}

async function appendOutcomeAuditEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: StrategicOutcomeCommand,
  outcomeId: string,
): Promise<void> {
  const eventType = 'strategic_action.outcome_recorded';
  const metadata = JSON.stringify({
    requestId: command.requestId,
    reviewId: command.review.id,
    actionId: command.review.actionId,
    executionStatus: command.executionStatus,
    satisfaction: command.satisfaction,
    regret: command.regret,
    energy: command.energy,
    hasEngagementQuality: command.engagementQuality !== undefined,
    hasInteractionDepth: command.interactionDepth !== undefined,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, 'strategic_action_outcome', $4,
       'personal_understanding', 'recorded', $5::jsonb, $6)`,
    [
      context.tenantId,
      context.ownerUserId,
      eventType,
      outcomeId,
      metadata,
      command.recordedAt,
    ],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'strategic_action_outcome', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, outcomeId, eventType, metadata, command.recordedAt],
  );
}

function rowToReview(row: StrategicReviewRow): StrategicRecommendationReview {
  return {
    id: row.id,
    actionId: row.action_ref,
    actionTitle: row.action_title,
    actionKind: row.action_kind,
    actionRank: row.action_rank,
    decision: row.decision,
    usefulness: row.usefulness as 1 | 2 | 3 | 4 | 5,
    trust: row.trust as 1 | 2 | 3 | 4 | 5,
    friction: row.friction as 1 | 2 | 3 | 4 | 5,
    ...(row.note !== null ? { note: row.note } : {}),
    strategyRevision: Number(row.strategy_revision),
    decisionContextRevision: Number(row.decision_context_revision),
    decisionContextHash: row.decision_context_sha256,
    decisionWindowEndsAt: toDate(row.decision_window_ends_at),
    reviewedAt: toDate(row.reviewed_at),
    ...(row.supersedes_review_id !== null ? { supersedesReviewId: row.supersedes_review_id } : {}),
  };
}

function rowToOutcome(row: StrategicOutcomeRow): StrategicActionOutcome {
  return {
    id: row.id,
    reviewId: row.review_id,
    actionId: row.action_ref,
    actionTitle: row.action_title,
    executionStatus: row.execution_status,
    satisfaction: row.satisfaction as 1 | 2 | 3 | 4 | 5,
    regret: row.regret as 1 | 2 | 3 | 4 | 5,
    energy: row.energy as 1 | 2 | 3 | 4 | 5,
    ...(row.engagement_quality !== null
      ? { engagementQuality: row.engagement_quality as 1 | 2 | 3 | 4 | 5 }
      : {}),
    ...(row.interaction_depth !== null
      ? { interactionDepth: row.interaction_depth as 1 | 2 | 3 | 4 | 5 }
      : {}),
    privateMessages: row.private_messages,
    opportunitiesCreated: row.opportunities_created,
    relationshipChange: row.relationship_change,
    mediaOpportunities: row.media_opportunities,
    perceptionShift: row.perception_shift,
    businessOutcome: row.business_outcome,
    ...(row.note !== null ? { note: row.note } : {}),
    outcomeOccurredAt: toDate(row.outcome_occurred_at),
    recordedAt: toDate(row.recorded_at),
    ...(row.supersedes_outcome_id !== null
      ? { supersedesOutcomeId: row.supersedes_outcome_id }
      : {}),
  };
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Stored strategic review timestamp is invalid.');
  return date;
}
