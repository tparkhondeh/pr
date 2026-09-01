import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from './sql.js';
import {
  ModelInvocationConflictError,
  ModelInvocationPermissionError,
  ModelInvocationValidationError,
  modelInvocationBeginFingerprint,
  modelInvocationCompletionFingerprint,
  type BeginModelInvocationCommand,
  type CompleteModelInvocationCommand,
  type ModelInvocationBeginResult,
  type ModelInvocationJournalRepository,
  type ModelInvocationRecord,
  type ModelInvocationStatus,
  type ModelInvocationSummary,
} from '../providers/model-invocation-journal.js';
import type { CostEvidence } from '../observability/workflow-cost-control.js';
import type { ModelDataClass, ModelTier } from '../providers/model-governance.js';
import type { ModelPurpose } from '../providers/model-gateway.js';
import type { modelInputSafetyPolicyVersion } from '../providers/model-input-safety.js';

type ModelInvocationRow = Readonly<{
  id: string;
  request_id: string;
  request_sha256: string;
  workflow_id: string;
  invocation_id: string;
  purpose: ModelPurpose;
  schema_name: string;
  registry_entry_id: string;
  prompt_version: string;
  provider: string;
  model: string;
  model_tier: ModelTier;
  data_classes: readonly ModelDataClass[];
  external_processing_approved: boolean;
  input_safety_policy_version: typeof modelInputSafetyPolicyVersion | null;
  input_sha256: string;
  status: ModelInvocationStatus;
  status_reason: string | null;
  reservation_id: string | null;
  charge_id: string | null;
  provider_trace_id: string | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cached_input_tokens: string | number | null;
  cost_minor_units: number | null;
  cost_evidence: CostEvidence | null;
  output_sha256: string | null;
  completion_sha256: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
}>;

export class PostgresModelInvocationJournalRepository implements ModelInvocationJournalRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public begin(command: BeginModelInvocationCommand): Promise<ModelInvocationBeginResult> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      await lockInvocation(transaction, this.context, command.requestId, command.workflowId, command.invocationId);
      const fingerprint = modelInvocationBeginFingerprint(command);
      const existing = await transaction.query<ModelInvocationRow>(
        `${modelInvocationSelect}
          WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_sha256 !== fingerprint) {
          throw new ModelInvocationConflictError('idempotency_mismatch');
        }
        return { record: rowToModelInvocation(existing.rows[0]), replay: true };
      }
      const priorInvocation = await transaction.query<Readonly<{ id: string }>>(
        `SELECT id FROM app.model_invocations
          WHERE tenant_id = $1 AND owner_user_id = $2
            AND workflow_id = $3 AND invocation_id = $4`,
        [
          this.context.tenantId, this.context.ownerUserId,
          command.workflowId, command.invocationId,
        ],
      );
      if (priorInvocation.rowCount > 0) {
        throw new ModelInvocationConflictError('invocation_already_recorded');
      }
      const id = deterministicUuid(
        `model-invocation:${command.tenantId}:${command.actorId}:${command.requestId}`,
      );
      await transaction.query(
        `INSERT INTO app.model_invocations (
          id, tenant_id, owner_user_id, request_id, request_sha256,
          workflow_id, invocation_id, purpose, schema_name, registry_entry_id,
          prompt_version, provider, model, model_tier, data_classes,
          external_processing_approved, input_safety_policy_version,
          input_sha256, status, started_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, 'started', $19
        )`,
        [
          id, this.context.tenantId, this.context.ownerUserId, command.requestId, fingerprint,
          command.workflowId, command.invocationId, command.purpose, command.schemaName,
          command.registryEntryId, command.promptVersion, command.provider, command.model,
          command.modelTier, [...new Set(command.dataClasses)].sort(),
          command.externalProcessingApproved, command.inputSafetyPolicyVersion,
          command.inputSha256, command.startedAt,
        ],
      );
      await appendAudit(transaction, this.context, {
        id,
        eventType: 'model_invocation.started',
        decision: 'started',
        occurredAt: command.startedAt,
        metadata: {
          requestId: command.requestId,
          workflowId: command.workflowId,
          invocationId: command.invocationId,
          purpose: command.purpose,
          schemaName: command.schemaName,
          registryEntryId: command.registryEntryId,
          promptVersion: command.promptVersion,
          provider: command.provider,
          model: command.model,
          modelTier: command.modelTier,
          dataClasses: [...new Set(command.dataClasses)].sort(),
          externalProcessingApproved: command.externalProcessingApproved,
          inputSafetyPolicyVersion: command.inputSafetyPolicyVersion,
          inputSha256: command.inputSha256,
        },
      });
      return {
        record: {
          id,
          requestId: command.requestId,
          requestSha256: fingerprint,
          workflowId: command.workflowId,
          invocationId: command.invocationId,
          purpose: command.purpose,
          schemaName: command.schemaName,
          registryEntryId: command.registryEntryId,
          promptVersion: command.promptVersion,
          provider: command.provider,
          model: command.model,
          modelTier: command.modelTier,
          dataClasses: [...new Set(command.dataClasses)].sort(),
          externalProcessingApproved: command.externalProcessingApproved,
          inputSafetyPolicyVersion: command.inputSafetyPolicyVersion,
          inputSha256: command.inputSha256,
          status: 'started',
          startedAt: command.startedAt,
        },
        replay: false,
      };
    });
  }

  public complete(command: CompleteModelInvocationCommand): Promise<ModelInvocationRecord> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ModelInvocationRow>(
        `${modelInvocationSelect}
          WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3 AND request_id = $4
          FOR UPDATE`,
        [this.context.tenantId, this.context.ownerUserId, command.invocationRecordId, command.requestId],
      );
      const existing = result.rows[0];
      if (!existing) throw new ModelInvocationConflictError('invocation_not_found');
      const fingerprint = modelInvocationCompletionFingerprint(command);
      if (existing.status !== 'started') {
        if (existing.completion_sha256 !== fingerprint) {
          throw new ModelInvocationConflictError('completion_mismatch');
        }
        return rowToModelInvocation(existing);
      }
      if (command.completedAt < toDate(existing.started_at)) {
        throw new ModelInvocationValidationError('Completion time cannot precede start time.');
      }
      const updated = await transaction.query<ModelInvocationRow>(
        `UPDATE app.model_invocations SET
          status = $5, status_reason = $6, reservation_id = $7, charge_id = $8,
          provider_trace_id = $9, input_tokens = $10, output_tokens = $11,
          cached_input_tokens = $12, cost_minor_units = $13, cost_evidence = $14,
          output_sha256 = $15, completion_sha256 = $16, completed_at = $17
         WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3 AND request_id = $4
         RETURNING ${modelInvocationColumns}`,
        [
          this.context.tenantId, this.context.ownerUserId, command.invocationRecordId,
          command.requestId, command.status, command.statusReason ?? null,
          command.reservationId ?? null, command.chargeId ?? null,
          command.providerTraceId ?? null, command.inputTokens ?? null,
          command.outputTokens ?? null, command.cachedInputTokens ?? null,
          command.costMinorUnits ?? null, command.costEvidence ?? null,
          command.outputSha256 ?? null, fingerprint, command.completedAt,
        ],
      );
      const row = updated.rows[0];
      if (!row) throw new ModelInvocationConflictError('invocation_not_found');
      await appendAudit(transaction, this.context, {
        id: command.invocationRecordId,
        eventType: `model_invocation.${command.status}`,
        decision: command.status,
        occurredAt: command.completedAt,
        metadata: completionAuditMetadata(command),
      });
      return rowToModelInvocation(row);
    });
  }

  public list(limit: number): Promise<readonly ModelInvocationRecord[]> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ModelInvocationRow>(
        `${modelInvocationSelect}
          WHERE tenant_id = $1 AND owner_user_id = $2
          ORDER BY started_at DESC, id DESC LIMIT $3`,
        [this.context.tenantId, this.context.ownerUserId, limit],
      );
      return result.rows.map(rowToModelInvocation);
    });
  }

  public summarize(): Promise<ModelInvocationSummary> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<Readonly<{
        total: string | number;
        started: string | number;
        succeeded: string | number;
        blocked: string | number;
        failed: string | number;
      }>>(
        `SELECT
          count(*) AS total,
          count(*) FILTER (WHERE status = 'started') AS started,
          count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
          count(*) FILTER (WHERE status = 'cost_blocked') AS blocked,
          count(*) FILTER (WHERE status IN (
            'provider_failed', 'timed_out', 'usage_invalid', 'output_invalid'
          )) AS failed
         FROM app.model_invocations
         WHERE tenant_id = $1 AND owner_user_id = $2`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      const row = result.rows[0];
      const started = Number(row?.started ?? 0);
      return {
        total: Number(row?.total ?? 0),
        started,
        recoveryRequired: started,
        succeeded: Number(row?.succeeded ?? 0),
        blocked: Number(row?.blocked ?? 0),
        failed: Number(row?.failed ?? 0),
      };
    });
  }

  private assertContext(command: Readonly<{ tenantId: string; actorId: string }>): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new ModelInvocationPermissionError('Model invocation repository context mismatch.');
    }
  }
}

const modelInvocationColumns = `id, request_id, request_sha256, workflow_id,
  invocation_id, purpose, schema_name, registry_entry_id, prompt_version,
  provider, model, model_tier, data_classes, external_processing_approved,
  input_safety_policy_version, input_sha256, status, status_reason, reservation_id, charge_id,
  provider_trace_id, input_tokens, output_tokens, cached_input_tokens,
  cost_minor_units, cost_evidence, output_sha256, completion_sha256,
  started_at, completed_at`;
const modelInvocationSelect = `SELECT ${modelInvocationColumns} FROM app.model_invocations`;

async function lockInvocation(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  workflowId: string,
  invocationId: string,
): Promise<void> {
  await transaction.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`${context.tenantId}:${context.ownerUserId}:model-request:${requestId}`],
  );
  await transaction.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`${context.tenantId}:${context.ownerUserId}:model-invocation:${workflowId}:${invocationId}`],
  );
}

async function appendAudit(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  input: Readonly<{
    id: string;
    eventType: string;
    decision: string;
    occurredAt: Date;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  const metadata = JSON.stringify(input.metadata);
  await transaction.query(
    `INSERT INTO app.audit_events (
      tenant_id, actor_user_id, event_type, resource_type, resource_id,
      purpose, decision, metadata, occurred_at
    ) VALUES ($1, $2, $3, 'model_invocation', $4,
      'strategy_reasoning', $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, input.eventType, input.id, input.decision, metadata, input.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
    ) VALUES ($1, 'model_invocation', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, input.id, input.eventType, metadata, input.occurredAt],
  );
}

function completionAuditMetadata(command: CompleteModelInvocationCommand): Readonly<Record<string, unknown>> {
  return {
    requestId: command.requestId,
    status: command.status,
    statusReason: command.statusReason ?? null,
    reservationId: command.reservationId ?? null,
    chargeId: command.chargeId ?? null,
    providerTraceId: command.providerTraceId ?? null,
    inputTokens: command.inputTokens ?? null,
    outputTokens: command.outputTokens ?? null,
    cachedInputTokens: command.cachedInputTokens ?? null,
    costMinorUnits: command.costMinorUnits ?? null,
    costEvidence: command.costEvidence ?? null,
    outputSha256: command.outputSha256 ?? null,
  };
}

function rowToModelInvocation(row: ModelInvocationRow): ModelInvocationRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    requestSha256: row.request_sha256,
    workflowId: row.workflow_id,
    invocationId: row.invocation_id,
    purpose: row.purpose,
    schemaName: row.schema_name,
    registryEntryId: row.registry_entry_id,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    modelTier: row.model_tier,
    dataClasses: row.data_classes,
    externalProcessingApproved: row.external_processing_approved,
    ...(row.input_safety_policy_version
      ? { inputSafetyPolicyVersion: row.input_safety_policy_version }
      : {}),
    inputSha256: row.input_sha256,
    status: row.status,
    ...(row.status_reason ? { statusReason: row.status_reason } : {}),
    ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
    ...(row.charge_id ? { chargeId: row.charge_id } : {}),
    ...(row.provider_trace_id ? { providerTraceId: row.provider_trace_id } : {}),
    ...(row.input_tokens !== null ? { inputTokens: Number(row.input_tokens) } : {}),
    ...(row.output_tokens !== null ? { outputTokens: Number(row.output_tokens) } : {}),
    ...(row.cached_input_tokens !== null ? { cachedInputTokens: Number(row.cached_input_tokens) } : {}),
    ...(row.cost_minor_units !== null ? { costMinorUnits: row.cost_minor_units } : {}),
    ...(row.cost_evidence ? { costEvidence: row.cost_evidence } : {}),
    ...(row.output_sha256 ? { outputSha256: row.output_sha256 } : {}),
    startedAt: toDate(row.started_at),
    ...(row.completed_at ? { completedAt: toDate(row.completed_at) } : {}),
  };
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
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
  if (Number.isNaN(date.getTime())) throw new Error('Stored model invocation date is invalid.');
  return date;
}
