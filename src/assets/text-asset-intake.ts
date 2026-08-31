import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type TextAssetPermissions = Readonly<{
  personalUnderstanding: true;
  brandUsage: boolean;
}>;

export type TextAssetRecord = Readonly<{
  requestId: string;
  assetId: string;
  evidenceId: string;
  assertionId: string;
  title: string;
  content: string;
  assertionText: string;
  sourceType: 'text_asset';
  dataClass: 'confidential';
  integritySha256: string;
  occurredAt: Date;
  importedAt: Date;
  permissions: TextAssetPermissions;
}>;

export type TextAssetSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  summary: Readonly<{
    assets: number;
    evidenceItems: number;
    assertions: number;
    dataRights: number;
  }>;
  records: readonly TextAssetRecord[];
}>;

export type TextAssetImportCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  title: string;
  content: string;
  assertionText: string;
  occurredAt: Date;
  importedAt: Date;
  permissions: TextAssetPermissions;
}>;

export type TextAssetImportResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  record: TextAssetRecord;
  persistence: 'memory' | 'postgres';
}>;

export type TextAssetRightOperation = 'revoke_brand_usage' | 'delete';

export type TextAssetRightCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  assetId: string;
  operation: TextAssetRightOperation;
  reason: string;
  occurredAt: Date;
}>;

export type TextAssetRightResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  assetId: string;
  operation: TextAssetRightOperation;
  brandUsage: false;
  deleted: boolean;
  occurredAt: Date;
  persistence: 'memory' | 'postgres';
}>;

export interface TextAssetRepository {
  readonly persistence: 'memory' | 'postgres';
  importText(command: TextAssetImportCommand): Promise<Omit<TextAssetImportResult, 'persistence'>>;
  applyRight(command: TextAssetRightCommand): Promise<Omit<TextAssetRightResult, 'persistence'>>;
  list(tenantId: TenantId, actorId: UserId): Promise<readonly TextAssetRecord[]>;
  rightsCount(tenantId: TenantId, actorId: UserId): Promise<number>;
}

export class TextAssetValidationError extends Error {}
export class TextAssetPermissionError extends Error {}
export class TextAssetConflictError extends Error {}
export class TextAssetNotFoundError extends Error {}

export class TextAssetIntakeService {
  public constructor(
    private readonly repository: TextAssetRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public async importText(input: Omit<TextAssetImportCommand, 'tenantId'>): Promise<TextAssetImportResult> {
    this.assertOwner(input.actorId);
    const command = normalizeCommand({ ...input, tenantId: this.identity.tenantId });
    const result = await this.repository.importText(command);
    return { ...result, persistence: this.repository.persistence };
  }

  public async applyRight(input: Omit<TextAssetRightCommand, 'tenantId'>): Promise<TextAssetRightResult> {
    this.assertOwner(input.actorId);
    const command = normalizeRightCommand({ ...input, tenantId: this.identity.tenantId });
    const result = await this.repository.applyRight(command);
    return { ...result, persistence: this.repository.persistence };
  }

  public async snapshot(actorId: UserId, generatedAt: Date): Promise<TextAssetSnapshot> {
    this.assertOwner(actorId);
    if (Number.isNaN(generatedAt.getTime())) {
      throw new TextAssetValidationError('Asset snapshot time is invalid.');
    }
    const [records, dataRights] = await Promise.all([
      this.repository.list(this.identity.tenantId, actorId),
      this.repository.rightsCount(this.identity.tenantId, actorId),
    ]);
    return {
      generatedAt,
      persistence: this.repository.persistence,
      summary: {
        assets: records.length,
        evidenceItems: new Set(records.map((record) => record.evidenceId)).size,
        assertions: new Set(records.map((record) => record.assertionId)).size,
        dataRights,
      },
      records,
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new TextAssetPermissionError();
  }
}

type StoredRequest = Readonly<{ fingerprint: string; record: TextAssetRecord }>;

export class InMemoryTextAssetRepository implements TextAssetRepository {
  public readonly persistence = 'memory' as const;
  readonly #requests = new Map<string, StoredRequest>();
  readonly #assetKeys = new Map<string, string>();
  readonly #retiredRequests = new Map<string, string>();
  readonly #rightRequests = new Map<string, Readonly<{
    fingerprint: string;
    result: Omit<TextAssetRightResult, 'persistence'>;
  }>>();
  readonly #contentHashes = new Set<string>();

  public importText(command: TextAssetImportCommand): Promise<Omit<TextAssetImportResult, 'persistence'>> {
    const key = `${command.tenantId}:${command.actorId}:${command.requestId}`;
    const fingerprint = commandFingerprint(command);
    if (this.#retiredRequests.has(key)) {
      return Promise.reject(new TextAssetConflictError('Deleted asset import cannot be replayed.'));
    }
    const existing = this.#requests.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new TextAssetConflictError('Asset request ID has conflicting content.'));
      }
      return Promise.resolve({ outcome: 'already_applied', record: existing.record });
    }
    const integritySha256 = textSha256(command.content);
    if (this.#contentHashes.has(`${command.tenantId}:${integritySha256}`)) {
      return Promise.reject(new TextAssetConflictError('This asset content was already imported.'));
    }
    const record: TextAssetRecord = {
      requestId: command.requestId,
      assetId: `asset_${command.requestId}`,
      evidenceId: `evidence_${command.requestId}`,
      assertionId: `assertion_${command.requestId}`,
      title: command.title,
      content: command.content,
      assertionText: command.assertionText,
      sourceType: 'text_asset',
      dataClass: 'confidential',
      integritySha256,
      occurredAt: command.occurredAt,
      importedAt: command.importedAt,
      permissions: command.permissions,
    };
    this.#contentHashes.add(`${command.tenantId}:${integritySha256}`);
    this.#requests.set(key, { fingerprint, record });
    this.#assetKeys.set(`${command.tenantId}:${command.actorId}:${record.assetId}`, key);
    return Promise.resolve({ outcome: 'applied', record });
  }

  public applyRight(command: TextAssetRightCommand): Promise<Omit<TextAssetRightResult, 'persistence'>> {
    const rightKey = `${command.tenantId}:${command.actorId}:${command.requestId}`;
    const fingerprint = rightCommandFingerprint(command);
    const repeated = this.#rightRequests.get(rightKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) {
        return Promise.reject(new TextAssetConflictError('Asset right request has conflicting content.'));
      }
      return Promise.resolve({ ...repeated.result, outcome: 'already_applied' });
    }
    const assetKey = `${command.tenantId}:${command.actorId}:${command.assetId}`;
    const importKey = this.#assetKeys.get(assetKey);
    const stored = importKey ? this.#requests.get(importKey) : undefined;
    if (!importKey || !stored) return Promise.reject(new TextAssetNotFoundError());

    if (command.operation === 'revoke_brand_usage') {
      const record: TextAssetRecord = {
        ...stored.record,
        permissions: { personalUnderstanding: true, brandUsage: false },
      };
      this.#requests.set(importKey, { ...stored, record });
    } else {
      this.#requests.delete(importKey);
      this.#assetKeys.delete(assetKey);
      this.#retiredRequests.set(importKey, stored.fingerprint);
    }
    const result: Omit<TextAssetRightResult, 'persistence'> = {
      outcome: 'applied',
      assetId: command.assetId,
      operation: command.operation,
      brandUsage: false,
      deleted: command.operation === 'delete',
      occurredAt: command.occurredAt,
    };
    this.#rightRequests.set(rightKey, { fingerprint, result });
    return Promise.resolve(result);
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly TextAssetRecord[]> {
    const prefix = `${tenantId}:${actorId}:`;
    return Promise.resolve(
      [...this.#requests.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, request]) => request.record)
        .sort((left, right) => right.importedAt.getTime() - left.importedAt.getTime()),
    );
  }

  public rightsCount(tenantId: TenantId, actorId: UserId): Promise<number> {
    const prefix = `${tenantId}:${actorId}:`;
    return Promise.resolve([...this.#rightRequests.keys()].filter((key) => key.startsWith(prefix)).length);
  }
}

type RequestRow = Readonly<{
  request_sha256: string;
  result_snapshot: unknown;
  asset_deleted_at: Date | string | null;
}>;

type RightRequestRow = Readonly<{
  request_sha256: string;
  result_snapshot: unknown;
}>;

type RightAssetRow = Readonly<{
  request_id: string;
  assertion_id: string;
  result_snapshot: unknown;
  asset_deleted_at: Date | string | null;
}>;

type AssetRow = Readonly<{
  request_id: string;
  asset_id: string;
  evidence_id: string;
  assertion_id: string;
  title: string;
  content: string;
  assertion_text: string;
  integrity_sha256: string;
  occurred_at: Date | string;
  imported_at: Date | string;
  permissions: unknown;
}>;

type IdRow = Readonly<{ id: string }>;

export class PostgresTextAssetRepository implements TextAssetRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public importText(command: TextAssetImportCommand): Promise<Omit<TextAssetImportResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:${this.context.ownerUserId}:${command.requestId}`,
      ]);
      const fingerprint = commandFingerprint(command);
      const existing = await transaction.query<RequestRow>(
        `SELECT request.request_sha256, request.result_snapshot,
                asset.deleted_at AS asset_deleted_at
           FROM app.asset_intake_requests request
           JOIN app.assets asset
             ON asset.tenant_id = request.tenant_id AND asset.id = request.asset_id
          WHERE request.tenant_id = $1 AND request.owner_user_id = $2
            AND request.client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        if (existingRow.request_sha256 !== fingerprint) {
          throw new TextAssetConflictError('Asset request ID has conflicting content.');
        }
        if (existingRow.asset_deleted_at) {
          throw new TextAssetConflictError('Deleted asset import cannot be replayed.');
        }
        return { outcome: 'already_applied', record: recordFromSnapshot(existingRow.result_snapshot) };
      }

      const integritySha256 = textSha256(command.content);
      const duplicate = await transaction.query<{ id: string }>(
        `SELECT id::text AS id FROM app.assets
          WHERE tenant_id = $1 AND content_sha256 = $2`,
        [this.context.tenantId, integritySha256],
      );
      if (duplicate.rowCount > 0) {
        throw new TextAssetConflictError('This asset content was already imported.');
      }
      const asset = await transaction.query<IdRow>(
        `INSERT INTO app.assets (
           tenant_id, owner_user_id, kind, object_key, content_sha256,
           data_class, occurred_at, ingested_at
         ) VALUES ($1, $2, 'text', $3, $4, 'confidential', $5, $6)
         RETURNING id::text AS id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          `inline://${command.requestId}`,
          integritySha256,
          command.occurredAt,
          command.importedAt,
        ],
      );
      const assetId = requiredId(asset.rows[0], 'Asset');
      const evidence = await transaction.query<IdRow>(
        `INSERT INTO app.evidence_items (
           tenant_id, asset_id, source_type, source_locator, content, data_class,
           integrity_sha256, occurred_at, observed_at
         ) VALUES ($1, $2, 'text_asset', $3, $4::jsonb, 'confidential', $5, $6, $7)
         RETURNING id::text AS id`,
        [
          this.context.tenantId,
          assetId,
          command.title,
          JSON.stringify({ title: command.title, text: command.content }),
          integritySha256,
          command.occurredAt,
          command.importedAt,
        ],
      );
      const evidenceId = requiredId(evidence.rows[0], 'Evidence');
      const assertion = await transaction.query<IdRow>(
        `INSERT INTO app.assertions (
           tenant_id, subject_ref, predicate, value, epistemic_type, data_class,
           confidence, confidence_rationale, valid_from, created_at, created_by
         ) VALUES ($1, $2, 'asset_supported_reflection', $3::jsonb, 'self_report',
           'confidential', 0.6, 'User-authored interpretation linked to one imported asset.',
           $4, $5, $2)
         RETURNING id::text AS id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          JSON.stringify(command.assertionText),
          command.occurredAt,
          command.importedAt,
        ],
      );
      const assertionId = requiredId(assertion.rows[0], 'Assertion');
      await transaction.query(
        `INSERT INTO app.assertion_evidence (
           tenant_id, assertion_id, evidence_id, relation, rationale, created_at
         ) VALUES ($1, $2, $3, 'supports', $4, $5)`,
        [this.context.tenantId, assertionId, evidenceId, `Imported text: ${command.title}`, command.importedAt],
      );
      await insertConsent(transaction, this.context, command.permissions, assertionId, command.importedAt);

      const record: TextAssetRecord = {
        requestId: command.requestId,
        assetId,
        evidenceId,
        assertionId,
        title: command.title,
        content: command.content,
        assertionText: command.assertionText,
        sourceType: 'text_asset',
        dataClass: 'confidential',
        integritySha256,
        occurredAt: command.occurredAt,
        importedAt: command.importedAt,
        permissions: command.permissions,
      };
      const snapshot = serializeRecord(record);
      await transaction.query(
        `INSERT INTO app.asset_intake_requests (
           tenant_id, owner_user_id, client_ref, request_sha256,
           asset_id, evidence_id, assertion_id, result_snapshot, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.requestId,
          fingerprint,
          assetId,
          evidenceId,
          assertionId,
          JSON.stringify(snapshot),
          command.importedAt,
        ],
      );
      const auditMetadata = JSON.stringify({
        requestId: command.requestId,
        evidenceId,
        assertionId,
        sourceType: 'text_asset',
        brandUsage: command.permissions.brandUsage,
      });
      await transaction.query(
        `INSERT INTO app.audit_events (
           tenant_id, actor_user_id, event_type, resource_type, resource_id,
           purpose, decision, metadata, occurred_at
         ) VALUES ($1, $2, 'asset.text_imported', 'asset', $3,
           'personal_understanding', 'approved', $4::jsonb, $5)`,
        [this.context.tenantId, this.context.ownerUserId, assetId, auditMetadata, command.importedAt],
      );
      await transaction.query(
        `INSERT INTO app.outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
         ) VALUES ($1, 'asset', $2, 'asset.text_imported', $3::jsonb, $4)`,
        [this.context.tenantId, assetId, auditMetadata, command.importedAt],
      );
      return { outcome: 'applied', record };
    });
  }

  public applyRight(command: TextAssetRightCommand): Promise<Omit<TextAssetRightResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:${this.context.ownerUserId}:asset-right:${command.requestId}`,
      ]);
      const fingerprint = rightCommandFingerprint(command);
      const repeated = await transaction.query<RightRequestRow>(
        `SELECT request_sha256, result_snapshot
           FROM app.asset_rights_requests
          WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const repeatedRow = repeated.rows[0];
      if (repeatedRow) {
        if (repeatedRow.request_sha256 !== fingerprint) {
          throw new TextAssetConflictError('Asset right request has conflicting content.');
        }
        return { ...rightResultFromSnapshot(repeatedRow.result_snapshot), outcome: 'already_applied' };
      }

      const source = await transaction.query<RightAssetRow>(
        `SELECT request.id::text AS request_id,
                request.assertion_id::text AS assertion_id,
                request.result_snapshot,
                asset.deleted_at AS asset_deleted_at
           FROM app.asset_intake_requests request
           JOIN app.assets asset
             ON asset.tenant_id = request.tenant_id AND asset.id = request.asset_id
          WHERE request.tenant_id = $1 AND request.owner_user_id = $2
            AND request.asset_id = $3::uuid`,
        [this.context.tenantId, this.context.ownerUserId, command.assetId],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow || sourceRow.asset_deleted_at) throw new TextAssetNotFoundError();
      const record = recordFromSnapshot(sourceRow.result_snapshot);
      const audience = `assertion:${sourceRow.assertion_id}`;
      const result: Omit<TextAssetRightResult, 'persistence'> = {
        outcome: 'applied',
        assetId: command.assetId,
        operation: command.operation,
        brandUsage: false,
        deleted: command.operation === 'delete',
        occurredAt: command.occurredAt,
      };

      if (command.operation === 'revoke_brand_usage') {
        const updatedRecord: TextAssetRecord = {
          ...record,
          permissions: { personalUnderstanding: true, brandUsage: false },
        };
        await transaction.query(
          `UPDATE app.asset_intake_requests
              SET result_snapshot = $4::jsonb
            WHERE tenant_id = $1 AND owner_user_id = $2 AND asset_id = $3::uuid`,
          [
            this.context.tenantId,
            this.context.ownerUserId,
            command.assetId,
            JSON.stringify(serializeRecord(updatedRecord)),
          ],
        );
        await transaction.query(
          `UPDATE app.consent_grants
              SET revoked_at = $4
            WHERE tenant_id = $1 AND subject_user_id = $2
              AND audience = $3 AND purpose = 'brand_usage'
              AND revoked_at IS NULL`,
          [this.context.tenantId, this.context.ownerUserId, audience, command.occurredAt],
        );
      } else {
        await transaction.query(
          `UPDATE app.assets SET deleted_at = $4
            WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3::uuid`,
          [this.context.tenantId, this.context.ownerUserId, command.assetId, command.occurredAt],
        );
        await transaction.query(
          `UPDATE app.evidence_items SET deleted_at = $4
            WHERE tenant_id = $1 AND id = $3::uuid
              AND asset_id = $2::uuid`,
          [this.context.tenantId, record.assetId, record.evidenceId, command.occurredAt],
        );
        await transaction.query(
          `UPDATE app.assertions SET deleted_at = $4, valid_to = COALESCE(valid_to, $4)
            WHERE tenant_id = $1 AND subject_ref = $2 AND id = $3::uuid`,
          [this.context.tenantId, this.context.ownerUserId, record.assertionId, command.occurredAt],
        );
        await transaction.query(
          `UPDATE app.consent_grants
              SET revoked_at = $4
            WHERE tenant_id = $1 AND subject_user_id = $2
              AND audience = $3 AND revoked_at IS NULL`,
          [this.context.tenantId, this.context.ownerUserId, audience, command.occurredAt],
        );
        await transaction.query(
          `UPDATE app.asset_intake_requests
              SET result_snapshot = $4::jsonb
            WHERE tenant_id = $1 AND owner_user_id = $2 AND asset_id = $3::uuid`,
          [
            this.context.tenantId,
            this.context.ownerUserId,
            command.assetId,
            JSON.stringify({ assetId: command.assetId, deleted: true, deletedAt: command.occurredAt.toISOString() }),
          ],
        );
      }

      await transaction.query(
        `INSERT INTO app.asset_rights_requests (
           tenant_id, owner_user_id, client_ref, request_sha256, asset_id,
           operation, reason, result_snapshot, created_at
         ) VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8::jsonb, $9)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.requestId,
          fingerprint,
          command.assetId,
          command.operation,
          command.reason,
          JSON.stringify(serializeRightResult(result)),
          command.occurredAt,
        ],
      );
      const metadata = JSON.stringify({
        requestId: command.requestId,
        operation: command.operation,
        reason: command.reason,
        deleted: result.deleted,
      });
      await transaction.query(
        `INSERT INTO app.audit_events (
           tenant_id, actor_user_id, event_type, resource_type, resource_id,
           purpose, decision, metadata, occurred_at
         ) VALUES ($1, $2, $3, 'asset', $4, 'personal_understanding', $5, $6::jsonb, $7)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          `asset.${command.operation}`,
          command.assetId,
          command.operation,
          metadata,
          command.occurredAt,
        ],
      );
      await transaction.query(
        `INSERT INTO app.outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
         ) VALUES ($1, 'asset', $2, $3, $4::jsonb, $5)`,
        [
          this.context.tenantId,
          command.assetId,
          `asset.${command.operation}`,
          metadata,
          command.occurredAt,
        ],
      );
      return result;
    });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly TextAssetRecord[]> {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      return Promise.reject(new TextAssetPermissionError());
    }
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<AssetRow>(
        `SELECT request.client_ref AS request_id,
                request.asset_id::text AS asset_id,
                request.evidence_id::text AS evidence_id,
                request.assertion_id::text AS assertion_id,
                evidence.content->>'title' AS title,
                evidence.content->>'text' AS content,
                assertion.value #>> '{}' AS assertion_text,
                evidence.integrity_sha256,
                evidence.occurred_at,
                asset.ingested_at AS imported_at,
                request.result_snapshot->'permissions' AS permissions
           FROM app.asset_intake_requests request
           JOIN app.assets asset ON asset.tenant_id = request.tenant_id AND asset.id = request.asset_id
           JOIN app.evidence_items evidence ON evidence.tenant_id = request.tenant_id AND evidence.id = request.evidence_id
           JOIN app.assertions assertion ON assertion.tenant_id = request.tenant_id AND assertion.id = request.assertion_id
          WHERE request.tenant_id = $1 AND request.owner_user_id = $2
            AND asset.deleted_at IS NULL AND evidence.deleted_at IS NULL
            AND assertion.deleted_at IS NULL
          ORDER BY asset.ingested_at DESC, request.id DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return result.rows.map(recordFromRow);
    });
  }

  public rightsCount(tenantId: TenantId, actorId: UserId): Promise<number> {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      return Promise.reject(new TextAssetPermissionError());
    }
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<{ count: string | number }>(
        `SELECT count(*) AS count
           FROM app.asset_rights_requests
          WHERE tenant_id = $1 AND owner_user_id = $2`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      const count = Number(result.rows[0]?.count ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid asset rights count.');
      return count;
    });
  }

  private assertContext(command: Readonly<{ tenantId: TenantId; actorId: UserId }>): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new TextAssetPermissionError();
    }
  }
}

function normalizeCommand(command: TextAssetImportCommand): TextAssetImportCommand {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(command.requestId)) {
    throw new TextAssetValidationError('Asset request ID is invalid.');
  }
  const title = command.title.trim();
  const content = command.content.trim();
  const assertionText = command.assertionText.trim();
  if (title.length < 3 || title.length > 160) {
    throw new TextAssetValidationError('Asset title must be 3-160 characters.');
  }
  if (content.length < 20 || content.length > 20_000) {
    throw new TextAssetValidationError('Asset content must be 20-20000 characters.');
  }
  if (assertionText.length < 10 || assertionText.length > 1_000) {
    throw new TextAssetValidationError('Asset assertion must be 10-1000 characters.');
  }
  if (!hasPersonalUnderstandingConsent(command.permissions)) {
    throw new TextAssetPermissionError('Personal understanding consent is required.');
  }
  if (
    Number.isNaN(command.occurredAt.getTime()) ||
    Number.isNaN(command.importedAt.getTime()) ||
    command.occurredAt > command.importedAt
  ) {
    throw new TextAssetValidationError('Asset dates are invalid.');
  }
  return { ...command, title, content, assertionText };
}

function normalizeRightCommand(command: TextAssetRightCommand): TextAssetRightCommand {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(command.requestId)) {
    throw new TextAssetValidationError('Asset right request ID is invalid.');
  }
  if (!command.assetId.trim()) throw new TextAssetValidationError('Asset ID is required.');
  const reason = command.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new TextAssetValidationError('Asset right reason must be 3-500 characters.');
  }
  if (Number.isNaN(command.occurredAt.getTime())) {
    throw new TextAssetValidationError('Asset right date is invalid.');
  }
  return { ...command, assetId: command.assetId.trim(), reason };
}

function commandFingerprint(command: TextAssetImportCommand): string {
  return textSha256(JSON.stringify({
    tenantId: command.tenantId,
    actorId: command.actorId,
    title: command.title,
    content: command.content,
    assertionText: command.assertionText,
    occurredAt: command.occurredAt.toISOString(),
    permissions: command.permissions,
  }));
}

function rightCommandFingerprint(command: TextAssetRightCommand): string {
  return textSha256(JSON.stringify({
    tenantId: command.tenantId,
    actorId: command.actorId,
    assetId: command.assetId,
    operation: command.operation,
    reason: command.reason,
  }));
}

function textSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function serializeRecord(record: TextAssetRecord): Record<string, unknown> {
  return {
    ...record,
    occurredAt: record.occurredAt.toISOString(),
    importedAt: record.importedAt.toISOString(),
  };
}

function serializeRightResult(
  result: Omit<TextAssetRightResult, 'persistence'>,
): Record<string, unknown> {
  return { ...result, occurredAt: result.occurredAt.toISOString() };
}

function rightResultFromSnapshot(value: unknown): Omit<TextAssetRightResult, 'persistence'> {
  if (!isRecord(value)) throw new Error('Stored asset right result is invalid.');
  const operation = value['operation'];
  if (
    typeof value['assetId'] !== 'string' ||
    (operation !== 'revoke_brand_usage' && operation !== 'delete') ||
    value['brandUsage'] !== false ||
    typeof value['deleted'] !== 'boolean'
  ) {
    throw new Error('Stored asset right result is invalid.');
  }
  return {
    outcome: value['outcome'] === 'already_applied' ? 'already_applied' : 'applied',
    assetId: value['assetId'],
    operation,
    brandUsage: false,
    deleted: value['deleted'],
    occurredAt: toDate(value['occurredAt'], 'Asset right'),
  };
}

function recordFromSnapshot(value: unknown): TextAssetRecord {
  if (!isRecord(value)) throw new Error('Stored asset result is invalid.');
  return recordFromValues(value);
}

function recordFromRow(row: AssetRow): TextAssetRecord {
  return recordFromValues({
    requestId: row.request_id,
    assetId: row.asset_id,
    evidenceId: row.evidence_id,
    assertionId: row.assertion_id,
    title: row.title,
    content: row.content,
    assertionText: row.assertion_text,
    sourceType: 'text_asset',
    dataClass: 'confidential',
    integritySha256: row.integrity_sha256,
    occurredAt: row.occurred_at,
    importedAt: row.imported_at,
    permissions: row.permissions,
  });
}

function recordFromValues(value: Readonly<Record<string, unknown>>): TextAssetRecord {
  const permissions = value['permissions'];
  if (
    typeof value['requestId'] !== 'string' ||
    typeof value['assetId'] !== 'string' ||
    typeof value['evidenceId'] !== 'string' ||
    typeof value['assertionId'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['content'] !== 'string' ||
    typeof value['assertionText'] !== 'string' ||
    typeof value['integritySha256'] !== 'string' ||
    !isRecord(permissions) ||
    permissions['personalUnderstanding'] !== true ||
    typeof permissions['brandUsage'] !== 'boolean'
  ) {
    throw new Error('Stored asset result is invalid.');
  }
  return {
    requestId: value['requestId'],
    assetId: value['assetId'],
    evidenceId: value['evidenceId'],
    assertionId: value['assertionId'],
    title: value['title'],
    content: value['content'],
    assertionText: value['assertionText'],
    sourceType: 'text_asset',
    dataClass: 'confidential',
    integritySha256: value['integritySha256'],
    occurredAt: toDate(value['occurredAt'], 'Asset occurrence'),
    importedAt: toDate(value['importedAt'], 'Asset import'),
    permissions: {
      personalUnderstanding: true,
      brandUsage: permissions['brandUsage'],
    },
  };
}

async function insertConsent(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  permissions: TextAssetPermissions,
  assertionId: string,
  grantedAt: Date,
): Promise<void> {
  const purposes = ['personal_understanding', ...(permissions.brandUsage ? ['brand_usage'] : [])];
  for (const purpose of purposes) {
    for (const operation of ['read', 'process', 'derive']) {
      await transaction.query(
        `INSERT INTO app.consent_grants (
           tenant_id, subject_user_id, granted_by, purpose, operation,
           data_class, audience, channel, policy_version, granted_at
         ) VALUES ($1, $2, $2, $3::app.consent_purpose, $4::app.consent_operation,
           'confidential', $5, 'internal', 'asset-intake-v1', $6)`,
        [context.tenantId, context.ownerUserId, purpose, operation, `assertion:${assertionId}`, grantedAt],
      );
    }
  }
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

function requiredId(row: IdRow | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} was not returned.`);
  return row.id;
}

function toDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${label} date is invalid.`);
  return date;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasPersonalUnderstandingConsent(
  permissions: Readonly<{ personalUnderstanding: boolean }>,
): boolean {
  return permissions.personalUnderstanding;
}
