import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type AuditTrailPersistence = 'memory' | 'postgres';

export type AuditTrailEvent = Readonly<{
  id: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  purpose?: string;
  decision?: string;
  metadata: Readonly<Record<string, unknown>>;
  occurredAt: Date;
}>;

export type AuditTrailSnapshot = Readonly<{
  generatedAt: Date;
  persistence: AuditTrailPersistence;
  summary: Readonly<{
    total: number;
    approvals: number;
    dataRights: number;
    exports: number;
  }>;
  events: readonly AuditTrailEvent[];
}>;

export type RecordAuditEvent = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  purpose?: string;
  decision?: string;
  metadata?: Readonly<Record<string, unknown>>;
  occurredAt: Date;
}>;

export interface AuditTrailRepository {
  readonly persistence: AuditTrailPersistence;
  snapshot(generatedAt: Date): Promise<AuditTrailSnapshot>;
  record(command: RecordAuditEvent): Promise<AuditTrailEvent>;
}

export class AuditTrailPermissionError extends Error {}
export class AuditTrailValidationError extends Error {}
export class AuditTrailConflictError extends Error {}

export class AuditTrailService {
  public constructor(
    private readonly repository: AuditTrailRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public async snapshot(actorId: UserId, generatedAt: Date): Promise<AuditTrailSnapshot> {
    this.assertOwner(actorId);
    return await this.repository.snapshot(generatedAt);
  }

  public async record(input: Omit<RecordAuditEvent, 'tenantId'>): Promise<AuditTrailEvent> {
    this.assertOwner(input.actorId);
    validateRecord(input);
    return await this.repository.record({ ...input, tenantId: this.identity.tenantId });
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new AuditTrailPermissionError();
  }
}

export class InMemoryAuditTrailRepository implements AuditTrailRepository {
  public readonly persistence = 'memory' as const;
  readonly #events = new Map<string, AuditTrailEvent>();
  readonly #fingerprints = new Map<string, string>();

  public snapshot(generatedAt: Date): Promise<AuditTrailSnapshot> {
    const events = [...this.#events.values()]
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 100);
    return Promise.resolve(toSnapshot(events, this.#events.size, generatedAt, this.persistence));
  }

  public record(command: RecordAuditEvent): Promise<AuditTrailEvent> {
    const fingerprint = JSON.stringify({
      tenantId: command.tenantId,
      actorId: command.actorId,
      eventType: command.eventType,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      purpose: command.purpose,
      decision: command.decision,
      metadata: command.metadata ?? {},
    });
    const existingFingerprint = this.#fingerprints.get(command.requestId);
    const existing = this.#events.get(command.requestId);
    if (existingFingerprint) {
      if (existingFingerprint !== fingerprint || !existing) throw new AuditTrailConflictError();
      return Promise.resolve(existing);
    }
    const event: AuditTrailEvent = {
      id: command.requestId,
      eventType: command.eventType,
      resourceType: command.resourceType,
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
      ...(command.purpose ? { purpose: command.purpose } : {}),
      ...(command.decision ? { decision: command.decision } : {}),
      metadata: command.metadata ?? {},
      occurredAt: command.occurredAt,
    };
    this.#fingerprints.set(command.requestId, fingerprint);
    this.#events.set(command.requestId, event);
    return Promise.resolve(event);
  }
}

type AuditRow = Readonly<{
  id: string;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  purpose: string | null;
  decision: string | null;
  metadata: unknown;
  occurred_at: Date | string;
  total_count: number | string;
}>;

export class PostgresAuditTrailRepository implements AuditTrailRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public snapshot(generatedAt: Date): Promise<AuditTrailSnapshot> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<AuditRow>(
        `SELECT id::text, event_type, resource_type, resource_id, purpose::text,
                decision, metadata, occurred_at, count(*) OVER () AS total_count
           FROM app.audit_events
          WHERE tenant_id = $1
            AND (actor_user_id = $2 OR actor_user_id IS NULL)
          ORDER BY occurred_at DESC, id DESC
          LIMIT 100`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      const events = result.rows.map(toEvent);
      const totalValue = result.rows[0]?.total_count ?? 0;
      const total = typeof totalValue === 'number' ? totalValue : Number(totalValue);
      return toSnapshot(events, total, generatedAt, this.persistence);
    });
  }

  public record(command: RecordAuditEvent): Promise<AuditTrailEvent> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<AuditRow>(
        `INSERT INTO app.audit_events (
           tenant_id, actor_user_id, event_type, resource_type, resource_id,
           purpose, decision, metadata, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6::app.consent_purpose, $7, $8::jsonb, $9)
         RETURNING id::text, event_type, resource_type, resource_id, purpose::text,
                   decision, metadata, occurred_at, 1 AS total_count`,
        [
          command.tenantId,
          command.actorId,
          command.eventType,
          command.resourceType,
          command.resourceId ?? null,
          command.purpose ?? null,
          command.decision ?? null,
          JSON.stringify(command.metadata ?? {}),
          command.occurredAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Audit event was not returned.');
      return toEvent(row);
    });
  }
}

function toSnapshot(
  events: readonly AuditTrailEvent[],
  total: number,
  generatedAt: Date,
  persistence: AuditTrailPersistence,
): AuditTrailSnapshot {
  return {
    generatedAt,
    persistence,
    summary: {
      total,
      approvals: events.filter((event) => event.decision === 'approved').length,
      dataRights: events.filter((event) => event.eventType.startsWith('memory.')).length,
      exports: events.filter((event) => event.eventType.endsWith('exported')).length,
    },
    events,
  };
}

function toEvent(row: AuditRow): AuditTrailEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    resourceType: row.resource_type,
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.purpose ? { purpose: row.purpose } : {}),
    ...(row.decision ? { decision: row.decision } : {}),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
  };
}

function validateRecord(input: Omit<RecordAuditEvent, 'tenantId'>): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{2,127}$/u.test(input.requestId)) {
    throw new AuditTrailValidationError('Audit request id is invalid.');
  }
  for (const value of [input.eventType, input.resourceType]) {
    if (!/^[a-z][a-z0-9_.-]{1,127}$/u.test(value)) {
      throw new AuditTrailValidationError('Audit event classification is invalid.');
    }
  }
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new AuditTrailValidationError('Audit event time is invalid.');
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
