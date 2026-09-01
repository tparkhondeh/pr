import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from './sql.js';
import {
  StrategicQualityConflictError,
  StrategicQualityPermissionError,
  type StrategicQualityRepository,
  type StrategicRecommendationReview,
  type StrategicReviewCommand,
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

  private assertContext(command: StrategicReviewCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new StrategicQualityPermissionError('Strategic review repository context mismatch.');
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
