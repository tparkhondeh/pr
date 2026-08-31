import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type ResearchSourceQuality =
  | 'primary'
  | 'authoritative_secondary'
  | 'secondary'
  | 'unverified';

export type ResearchSourceStance = 'supports' | 'contradicts';
export type ResearchFreshness = 'fresh' | 'aging' | 'stale';
export type ResearchFactCheckStatus =
  | 'citation_ready'
  | 'review_required'
  | 'contradicted'
  | 'conflicted';

export type ResearchSourceRecord = Readonly<{
  sourceId: string;
  claimId: string;
  evidenceId: string;
  requestId: string;
  title: string;
  publisher: string;
  url: string;
  excerpt: string;
  statement: string;
  quality: ResearchSourceQuality;
  stance: ResearchSourceStance;
  publishedAt: Date;
  accessedAt: Date;
  maxAgeDays: number;
}>;

export type ResearchSourceSnapshot = ResearchSourceRecord & Readonly<{
  qualityScore: number;
  freshness: ResearchFreshness;
  ageDays: number;
  factCheckStatus: ResearchFactCheckStatus;
  conflictDetected: boolean;
  citation: string;
  usableForPublicClaim: boolean;
}>;

export type ResearchWorkspaceSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  summary: Readonly<{
    totalSources: number;
    citationReady: number;
    stale: number;
    conflicts: number;
    unverified: number;
  }>;
  sources: readonly ResearchSourceSnapshot[];
}>;

export type ResearchImportCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  sourceId: string;
  claimId: string;
  evidenceId: string;
  title: string;
  publisher: string;
  url: string;
  excerpt: string;
  statement: string;
  quality: ResearchSourceQuality;
  stance: ResearchSourceStance;
  publishedAt: Date;
  accessedAt: Date;
  maxAgeDays: number;
}>;

export type ResearchImportResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  record: ResearchSourceRecord;
  persistence: 'memory' | 'postgres';
}>;

export interface ResearchWorkspaceRepository {
  readonly persistence: 'memory' | 'postgres';
  importSource(command: ResearchImportCommand): Promise<Omit<ResearchImportResult, 'persistence'>>;
  list(tenantId: TenantId, actorId: UserId): Promise<readonly ResearchSourceRecord[]>;
}

export class ResearchValidationError extends Error {}
export class ResearchPermissionError extends Error {}
export class ResearchConflictError extends Error {}

export class ResearchWorkspaceService {
  public constructor(
    private readonly repository: ResearchWorkspaceRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public async importSource(input: Readonly<{
    actorId: UserId;
    requestId: string;
    title: string;
    publisher: string;
    url: string;
    excerpt: string;
    statement: string;
    quality: ResearchSourceQuality;
    stance: ResearchSourceStance;
    publishedAt: Date;
    maxAgeDays: number;
    accessedAt: Date;
  }>): Promise<ResearchImportResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateText(input.title, 3, 300, 'Research title');
    validateText(input.publisher, 2, 200, 'Research publisher');
    validateText(input.excerpt, 20, 4_000, 'Research excerpt');
    validateText(input.statement, 3, 4_000, 'Research statement');
    validateSourceUrl(input.url);
    if (!researchQualities.includes(input.quality)) throw new ResearchValidationError('Research quality is invalid.');
    if (!researchStances.includes(input.stance)) throw new ResearchValidationError('Research stance is invalid.');
    if (!Number.isSafeInteger(input.maxAgeDays) || input.maxAgeDays < 1 || input.maxAgeDays > 3_650) {
      throw new ResearchValidationError('Research freshness window is invalid.');
    }
    if (Number.isNaN(input.publishedAt.getTime()) || input.publishedAt > input.accessedAt) {
      throw new ResearchValidationError('Research publication date is invalid.');
    }
    const result = await this.repository.importSource({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      sourceId: deterministicUuid(`research-source:${this.identity.tenantId}:${input.requestId}`),
      claimId: deterministicUuid(`research-claim:${this.identity.tenantId}:${input.requestId}`),
      evidenceId: deterministicUuid(`research-evidence:${this.identity.tenantId}:${input.requestId}`),
      title: input.title.trim(),
      publisher: input.publisher.trim(),
      url: normalizeSourceUrl(input.url),
      excerpt: input.excerpt.trim(),
      statement: input.statement.trim(),
      quality: input.quality,
      stance: input.stance,
      publishedAt: input.publishedAt,
      accessedAt: input.accessedAt,
      maxAgeDays: input.maxAgeDays,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  public async snapshot(actorId: UserId, at: Date): Promise<ResearchWorkspaceSnapshot> {
    this.assertOwner(actorId);
    const records = await this.repository.list(this.identity.tenantId, actorId);
    const conflictKeys = conflictingStatements(records);
    const sources = records.map((record) => sourceSnapshot(record, at, conflictKeys));
    return {
      generatedAt: at,
      persistence: this.repository.persistence,
      summary: {
        totalSources: sources.length,
        citationReady: sources.filter((source) => source.factCheckStatus === 'citation_ready').length,
        stale: sources.filter((source) => source.freshness === 'stale').length,
        conflicts: new Set(
          sources.filter((source) => source.conflictDetected).map((source) => normalizeStatement(source.statement)),
        ).size,
        unverified: sources.filter((source) => source.quality === 'unverified').length,
      },
      sources,
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new ResearchPermissionError('Only the owner can manage research.');
  }
}

export const researchQualities: readonly ResearchSourceQuality[] = [
  'primary', 'authoritative_secondary', 'secondary', 'unverified',
];

export const researchStances: readonly ResearchSourceStance[] = ['supports', 'contradicts'];

type StoredRequest = Readonly<{ fingerprint: string; record: ResearchSourceRecord }>;

export class InMemoryResearchWorkspaceRepository implements ResearchWorkspaceRepository {
  public readonly persistence = 'memory' as const;
  readonly #requests = new Map<string, StoredRequest>();

  public importSource(command: ResearchImportCommand): Promise<Omit<ResearchImportResult, 'persistence'>> {
    const key = `${command.tenantId}:${command.actorId}:${command.requestId}`;
    const fingerprint = commandFingerprint(command);
    const existing = this.#requests.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ResearchConflictError('Research request ID has conflicting content.');
      return Promise.resolve({ outcome: 'already_applied', record: existing.record });
    }
    const ownerPrefix = `${command.tenantId}:${command.actorId}:`;
    const duplicate = [...this.#requests.entries()].find(([requestKey, { record }]) => (
      requestKey.startsWith(ownerPrefix) &&
      record.url === command.url && normalizeStatement(record.statement) === normalizeStatement(command.statement) &&
      record.stance === command.stance
    ));
    if (duplicate) throw new ResearchConflictError('This research source and claim relation already exists.');
    const record = recordFromCommand(command);
    this.#requests.set(key, { fingerprint, record });
    return Promise.resolve({ outcome: 'applied', record });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly ResearchSourceRecord[]> {
    const prefix = `${tenantId}:${actorId}:`;
    return Promise.resolve(
      [...this.#requests.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value.record)
        .sort((left, right) => right.accessedAt.getTime() - left.accessedAt.getTime()),
    );
  }
}

type ResearchRow = Readonly<{
  source_id: string;
  claim_id: string;
  evidence_id: string;
  client_ref: string;
  request_sha256: string;
  title: string;
  publisher: string;
  source_url: string;
  excerpt: string;
  statement: string;
  quality: ResearchSourceQuality;
  stance: ResearchSourceStance;
  published_at: Date | string;
  accessed_at: Date | string;
  max_age_days: string | number;
}>;

export class PostgresResearchWorkspaceRepository implements ResearchWorkspaceRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public importSource(command: ResearchImportCommand): Promise<Omit<ResearchImportResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:${this.context.ownerUserId}:${command.requestId}`,
      ]);
      const fingerprint = commandFingerprint(command);
      const existing = await transaction.query<ResearchRow>(
        `${researchSelect()}
           WHERE source.tenant_id = $1 AND source.owner_user_id = $2 AND source.client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        if (existingRow.request_sha256 !== fingerprint) {
          throw new ResearchConflictError('Research request ID has conflicting content.');
        }
        return { outcome: 'already_applied', record: rowToRecord(existingRow) };
      }
      const duplicate = await transaction.query<{ source_id: string }>(
        `SELECT id::text AS source_id FROM app.research_sources
          WHERE tenant_id = $1 AND owner_user_id = $2 AND source_url = $3
            AND lower(regexp_replace(statement, '\\s+', ' ', 'g')) = $4 AND stance = $5`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.url,
          normalizeStatement(command.statement),
          command.stance,
        ],
      );
      if (duplicate.rowCount > 0) throw new ResearchConflictError('This research source and claim relation already exists.');

      await insertResearchEvidence(transaction, this.context, command, fingerprint);
      await insertResearchClaim(transaction, this.context, command);
      await transaction.query(
        `INSERT INTO app.claim_evidence (tenant_id, claim_id, evidence_id, relation, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [this.context.tenantId, command.claimId, command.evidenceId, command.stance, command.accessedAt],
      );
      await transaction.query(
        `INSERT INTO app.research_sources (
           id, tenant_id, owner_user_id, client_ref, request_sha256, claim_id, evidence_id,
           title, publisher, source_url, excerpt, statement, quality, stance,
           published_at, accessed_at, max_age_days
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          command.sourceId, this.context.tenantId, this.context.ownerUserId, command.requestId,
          fingerprint, command.claimId, command.evidenceId, command.title, command.publisher,
          command.url, command.excerpt, command.statement, command.quality, command.stance,
          command.publishedAt, command.accessedAt, command.maxAgeDays,
        ],
      );
      await appendResearchEvents(transaction, this.context, command);
      return { outcome: 'applied', record: recordFromCommand(command) };
    });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly ResearchSourceRecord[]> {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new ResearchPermissionError('Research repository context mismatch.');
    }
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ResearchRow>(
        `${researchSelect()}
           WHERE source.tenant_id = $1 AND source.owner_user_id = $2
           ORDER BY source.accessed_at DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return result.rows.map(rowToRecord);
    });
  }

  private assertContext(command: ResearchImportCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new ResearchPermissionError('Research repository context mismatch.');
    }
  }
}

function sourceSnapshot(
  record: ResearchSourceRecord,
  at: Date,
  conflictKeys: ReadonlySet<string>,
): ResearchSourceSnapshot {
  const ageDays = Math.max(0, Math.floor((at.getTime() - record.publishedAt.getTime()) / 86_400_000));
  const freshness: ResearchFreshness = ageDays > record.maxAgeDays
    ? 'stale'
    : ageDays >= Math.ceil(record.maxAgeDays * 0.75)
      ? 'aging'
      : 'fresh';
  const conflictDetected = conflictKeys.has(normalizeStatement(record.statement));
  const factCheckStatus: ResearchFactCheckStatus = conflictDetected
    ? 'conflicted'
    : record.stance === 'contradicts'
      ? 'contradicted'
      : record.quality === 'unverified' || freshness === 'stale'
        ? 'review_required'
        : 'citation_ready';
  return {
    ...record,
    qualityScore: qualityScores[record.quality],
    freshness,
    ageDays,
    factCheckStatus,
    conflictDetected,
    citation: `${record.publisher}. «${record.title}». ${record.publishedAt.toISOString().slice(0, 10)}. ${record.url} (accessed ${record.accessedAt.toISOString().slice(0, 10)}).`,
    usableForPublicClaim: factCheckStatus === 'citation_ready',
  };
}

const qualityScores: Readonly<Record<ResearchSourceQuality, number>> = {
  primary: 1,
  authoritative_secondary: 0.85,
  secondary: 0.65,
  unverified: 0.25,
};

function conflictingStatements(records: readonly ResearchSourceRecord[]): ReadonlySet<string> {
  const stances = new Map<string, Set<ResearchSourceStance>>();
  for (const record of records) {
    const key = normalizeStatement(record.statement);
    const values = stances.get(key) ?? new Set<ResearchSourceStance>();
    values.add(record.stance);
    stances.set(key, values);
  }
  return new Set([...stances.entries()].filter(([, values]) => values.size > 1).map(([key]) => key));
}

function recordFromCommand(command: ResearchImportCommand): ResearchSourceRecord {
  return {
    sourceId: command.sourceId,
    claimId: command.claimId,
    evidenceId: command.evidenceId,
    requestId: command.requestId,
    title: command.title,
    publisher: command.publisher,
    url: command.url,
    excerpt: command.excerpt,
    statement: command.statement,
    quality: command.quality,
    stance: command.stance,
    publishedAt: command.publishedAt,
    accessedAt: command.accessedAt,
    maxAgeDays: command.maxAgeDays,
  };
}

function researchSelect(): string {
  return `SELECT source.id::text AS source_id, source.claim_id::text, source.evidence_id::text,
                 source.client_ref, source.request_sha256, source.title, source.publisher,
                 source.source_url, source.excerpt, source.statement, source.quality,
                 source.stance, source.published_at, source.accessed_at, source.max_age_days
            FROM app.research_sources source`;
}

function rowToRecord(row: ResearchRow): ResearchSourceRecord {
  const maxAgeDays = Number(row.max_age_days);
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1) throw new Error('Stored research freshness window is invalid.');
  return {
    sourceId: row.source_id,
    claimId: row.claim_id,
    evidenceId: row.evidence_id,
    requestId: row.client_ref,
    title: row.title,
    publisher: row.publisher,
    url: row.source_url,
    excerpt: row.excerpt,
    statement: row.statement,
    quality: row.quality,
    stance: row.stance,
    publishedAt: toDate(row.published_at, 'Research publication'),
    accessedAt: toDate(row.accessed_at, 'Research access'),
    maxAgeDays,
  };
}

async function insertResearchEvidence(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: ResearchImportCommand,
  integritySha256: string,
): Promise<void> {
  await transaction.query(
    `INSERT INTO app.evidence_items (
       id, tenant_id, source_type, source_locator, content, data_class,
       integrity_sha256, occurred_at, observed_at
     ) VALUES ($1, $2, 'external_research', $3, $4::jsonb, 'public', $5, $6, $7)`,
    [
      command.evidenceId,
      context.tenantId,
      command.url,
      JSON.stringify({
        title: command.title,
        publisher: command.publisher,
        excerpt: command.excerpt,
        statement: command.statement,
        quality: command.quality,
        stance: command.stance,
      }),
      integritySha256,
      command.publishedAt,
      command.accessedAt,
    ],
  );
}

async function insertResearchClaim(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: ResearchImportCommand,
): Promise<void> {
  await transaction.query(
    `INSERT INTO app.claims (
       id, tenant_id, statement, kind, status, data_class, source_refs,
       allowed_purposes, allowed_channels, valid_from, created_at, created_by
     ) VALUES ($1, $2, $3, 'external_fact', 'proposed', 'public', $4::jsonb,
       ARRAY['external_research']::app.consent_purpose[], '{}'::text[], $5, $6, $7)`,
    [
      command.claimId,
      context.tenantId,
      command.statement,
      JSON.stringify([command.url]),
      command.publishedAt,
      command.accessedAt,
      context.ownerUserId,
    ],
  );
}

async function appendResearchEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: ResearchImportCommand,
): Promise<void> {
  const metadata = JSON.stringify({
    requestId: command.requestId,
    claimId: command.claimId,
    evidenceId: command.evidenceId,
    quality: command.quality,
    stance: command.stance,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, 'research.source_recorded', 'research_source', $3,
       'external_research', 'claim_proposed', $4::jsonb, $5)`,
    [context.tenantId, context.ownerUserId, command.sourceId, metadata, command.accessedAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'research_source', $2, 'research.source_recorded', $3::jsonb, $4)`,
    [context.tenantId, command.sourceId, metadata, command.accessedAt],
  );
}

function commandFingerprint(command: ResearchImportCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeStatement(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fa-IR');
}

function normalizeSourceUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = '';
  return url.toString();
}

function validateSourceUrl(value: string): void {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 2_048) {
      throw new ResearchValidationError('Research URL must be a credential-free HTTPS URL.');
    }
  } catch (error: unknown) {
    if (error instanceof ResearchValidationError) throw error;
    throw new ResearchValidationError('Research URL is invalid.');
  }
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ResearchValidationError('Research request id is invalid.');
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new ResearchValidationError(`${label} is invalid.`);
}

function toDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} date is invalid.`);
  return date;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
