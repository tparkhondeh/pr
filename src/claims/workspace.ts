import { createHash } from 'node:crypto';
import type { TextAssetIntakeService } from '../assets/text-asset-intake.js';
import type { ConversationIntakeService } from '../conversation/intake.js';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { FeedbackLearningService } from '../feedback/workspace.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import { evidenceId } from '../memory/personal-memory.js';
import type { StrategyContextService } from '../strategy/context.js';
import type { WorkbenchService, WorkbenchSnapshot } from '../workbench/workbench.js';
import { proposeClaim, verifyClaim, type Claim, type ClaimStatus } from './claim-registry.js';
import type { ClaimGovernanceRepository } from './governance.js';
import { guardDraft, type DraftGuardResult, type GuardViolation } from './draft-guard.js';
import {
  composePlatformDraft,
  draftChannels,
  platformAdaptationFor,
  platformAdaptationProfileVersion,
  platformFormatIssues,
  type DraftChannel,
  type PlatformAdaptationProfileVersion,
  type PlatformAdaptationSnapshot,
} from './platform-adaptation.js';

export { draftChannels } from './platform-adaptation.js';
export type { DraftChannel, PlatformAdaptationSnapshot } from './platform-adaptation.js';

export type DraftSourceKind = 'memory' | 'text_asset';

export type DraftSourceRecord = Readonly<{
  kind: DraftSourceKind;
  ref: string;
  label: string;
  assertionId: string;
  statement: string;
  evidenceIds: readonly string[];
  sourceTypes: readonly string[];
}>;

export type DraftSourceSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres' | 'mixed';
  records: readonly DraftSourceRecord[];
}>;

export type DraftWorkspacePersistence = 'memory' | 'postgres';
export type DraftWorkspaceStatus = 'guard_failed' | 'awaiting_approval' | 'approved' | 'exported';

export type DraftWorkspaceSnapshot = Readonly<{
  draftId: string;
  claimId: string;
  revision: number;
  strategyRevision: number;
  channel: DraftChannel;
  body: string;
  adaptation: PlatformAdaptationSnapshot;
  status: DraftWorkspaceStatus;
  guard: DraftGuardResult;
  source: DraftSourceRecord;
  publicDraftingConsent: true;
  sourceAvailable: boolean;
  staleStrategy: boolean;
  approvedAt?: Date;
  exportedAt?: Date;
  updatedAt: Date;
  persistence: DraftWorkspacePersistence;
}>;

type BaseCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  occurredAt: Date;
}>;

export type CreateDraftCommand = BaseCommand & Readonly<{
  draftId: string;
  claimId: string;
  strategyRevision: number;
  channel: DraftChannel;
  body: string;
  adaptationProfileVersion: PlatformAdaptationProfileVersion;
  guard: DraftGuardResult;
  source: DraftWorkspaceSnapshot['source'];
}>;

export type EditDraftCommand = BaseCommand & Readonly<{
  draftId: string;
  expectedRevision: number;
  body: string;
  guard: DraftGuardResult;
}>;

export type TransitionDraftCommand = BaseCommand & Readonly<{
  draftId: string;
  expectedRevision: number;
}>;

export type DraftRepositoryResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  snapshot: DraftWorkspaceSnapshot;
}>;

export interface DraftWorkspaceRepository {
  readonly persistence: DraftWorkspacePersistence;
  find(): Promise<DraftWorkspaceSnapshot | null>;
  create(command: CreateDraftCommand): Promise<DraftRepositoryResult>;
  edit(command: EditDraftCommand): Promise<DraftRepositoryResult>;
  approve(command: TransitionDraftCommand): Promise<DraftRepositoryResult>;
  export(command: TransitionDraftCommand): Promise<DraftRepositoryResult>;
}

export class DraftValidationError extends Error {}
export class DraftPermissionError extends Error {}
export class DraftNotFoundError extends Error {}
export class DraftConflictError extends Error {
  public constructor(public readonly reason: 'revision_changed' | 'idempotency_mismatch') {
    super(`Draft conflict: ${reason}`);
  }
}
export class DraftBlockedError extends Error {
  public constructor(
    public readonly reason:
      | 'content_action_not_approved'
      | 'source_not_available'
      | 'source_not_authorized_for_action'
      | 'guard_failed'
      | 'strategy_changed'
      | 'claim_not_verified'
      | 'draft_not_approved',
  ) {
    super(`Draft blocked: ${reason}`);
  }
}

export type DraftExport = Readonly<{
  outcome: 'applied' | 'already_applied';
  filename: string;
  mimeType: 'text/plain;charset=utf-8';
  content: string;
  snapshot: DraftWorkspaceSnapshot;
}>;

export class ContentDraftService {
  public constructor(
    private readonly repository: DraftWorkspaceRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly conversation: Pick<ConversationIntakeService, 'memorySnapshot'>,
    private readonly workbench: Pick<WorkbenchService, 'snapshot'>,
    private readonly strategy: Pick<StrategyContextService, 'snapshot'>,
    private readonly learning?: Pick<FeedbackLearningService, 'recordDraftEdit' | 'appliedPreferences'>,
    private readonly assets?: Pick<TextAssetIntakeService, 'snapshot'>,
    private readonly claimPolicy?: Pick<ClaimGovernanceRepository, 'effectiveStatus'>,
  ) {}

  public async sources(actorId: UserId, at: Date): Promise<DraftSourceSnapshot> {
    this.assertOwner(actorId);
    const [memory, assets] = await Promise.all([
      this.conversation.memorySnapshot({
        tenantId: this.identity.tenantId,
        actorId,
        generatedAt: at,
      }),
      this.assets?.snapshot(actorId, at),
    ]);
    const memorySources: DraftSourceRecord[] = memory.records
      .filter((record) => (
        record.lifecycle.status === 'active' && record.text &&
        record.consent.brandUsage && record.provenance.evidenceIds.length > 0
      ))
      .map((record) => ({
        kind: 'memory',
        ref: record.proposalId,
        label: record.text?.slice(0, 120) ?? 'حافظه تأییدشده',
        assertionId: record.assertionId,
        statement: record.text ?? '',
        evidenceIds: record.provenance.evidenceIds,
        sourceTypes: record.provenance.sourceTypes,
      }));
    const assetSources: DraftSourceRecord[] = assets?.records
      .filter((record) => record.permissions.brandUsage)
      .map((record) => ({
        kind: 'text_asset',
        ref: record.assetId,
        label: record.title,
        assertionId: record.assertionId,
        statement: record.assertionText,
        evidenceIds: [record.evidenceId],
        sourceTypes: [record.sourceType],
      })) ?? [];
    return {
      generatedAt: at,
      persistence: assets && assets.persistence !== memory.persistence
        ? 'mixed'
        : (assets?.persistence ?? memory.persistence),
      records: [...assetSources, ...memorySources],
    };
  }

  public async snapshot(actorId: UserId, at: Date): Promise<DraftWorkspaceSnapshot | null> {
    this.assertOwner(actorId);
    const current = await this.repository.find();
    if (!current) return null;
    const strategy = await this.strategy.snapshot(actorId);
    const [source, workbench] = await Promise.all([
      this.findSource(actorId, current.source.kind, current.source.ref, at),
      this.workbench.snapshot(),
    ]);
    return {
      ...current,
      staleStrategy: strategy.revision !== current.strategyRevision,
      sourceAvailable: Boolean(source && sourceAuthorizedForContentAction(workbench, source)),
    };
  }

  public async create(input: Readonly<{
    actorId: UserId;
    requestId: string;
    sourceKind: DraftSourceKind;
    sourceRef: string;
    channel: DraftChannel;
    narrativeAngle: string;
    takeaway: string;
    publicDraftingConsent: boolean;
    occurredAt: Date;
  }>): Promise<DraftRepositoryResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    if (!input.publicDraftingConsent) throw new DraftPermissionError('Explicit public drafting consent is required.');
    validateText(input.narrativeAngle, 3, 500, 'Narrative angle');
    validateText(input.takeaway, 3, 2_000, 'Takeaway');
    if (!draftChannels.includes(input.channel)) throw new DraftValidationError('Draft channel is invalid.');
    const workbench = await this.workbench.snapshot();
    if (workbench.workflow.status !== 'approved' || workbench.workflow.approvedActionId !== 'essay') {
      throw new DraftBlockedError('content_action_not_approved');
    }
    const strategy = await this.strategy.snapshot(input.actorId);
    const source = await this.findSource(
      input.actorId,
      input.sourceKind,
      input.sourceRef,
      input.occurredAt,
    );
    if (!source) throw new DraftBlockedError('source_not_available');
    if (!sourceAuthorizedForContentAction(workbench, source)) {
      throw new DraftBlockedError('source_not_authorized_for_action');
    }
    const preferences = await this.learning?.appliedPreferences(input.actorId, input.occurredAt) ?? {};
    const body = composePlatformDraft(
      input.channel,
      input.narrativeAngle.trim(),
      source.statement,
      input.takeaway.trim(),
      preferences,
    );
    const draftId = deterministicUuid(`draft:${this.identity.tenantId}:${input.requestId}`);
    const claimId = deterministicUuid(`claim:${this.identity.tenantId}:${input.requestId}`);
    const sourceValue = source;
    const guard = reviewBody(
      draftId,
      this.identity.tenantId,
      input.actorId,
      input.channel,
      body,
      claimId,
      sourceValue,
      input.occurredAt,
    );
    return this.repository.create({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      draftId,
      claimId,
      strategyRevision: strategy.revision,
      channel: input.channel,
      body,
      adaptationProfileVersion: platformAdaptationProfileVersion,
      guard,
      source: sourceValue,
    });
  }

  public async edit(input: Readonly<{
    actorId: UserId;
    requestId: string;
    draftId: string;
    expectedRevision: number;
    body: string;
    occurredAt: Date;
  }>): Promise<DraftRepositoryResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateText(input.body, 20, 20_000, 'Draft body');
    const current = await this.requiredCurrent(input.draftId);
    const strategy = await this.strategy.snapshot(input.actorId);
    if (strategy.revision !== current.strategyRevision) throw new DraftBlockedError('strategy_changed');
    const claimStatus = await this.claimPolicy?.effectiveStatus(
      this.identity.tenantId,
      input.actorId,
      current.claimId,
      'verified' satisfies ClaimStatus,
    ) ?? 'verified';
    if (claimStatus !== 'verified') throw new DraftBlockedError('claim_not_verified');
    const source = await this.findSource(
      input.actorId,
      current.source.kind,
      current.source.ref,
      input.occurredAt,
    );
    if (!source) throw new DraftBlockedError('source_not_available');
    if (!sourceAuthorizedForContentAction(await this.workbench.snapshot(), source)) {
      throw new DraftBlockedError('source_not_authorized_for_action');
    }
    const guard = reviewBody(
      current.draftId,
      this.identity.tenantId,
      input.actorId,
      current.channel,
      input.body.trim(),
      current.claimId,
      current.source,
      input.occurredAt,
    );
    const result = await this.repository.edit({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      draftId: current.draftId,
      expectedRevision: input.expectedRevision,
      body: input.body.trim(),
      guard,
    });
    await this.learning?.recordDraftEdit({
      actorId: input.actorId,
      requestId: input.requestId,
      draftId: current.draftId,
      before: current.body,
      after: result.snapshot.body,
      occurredAt: input.occurredAt,
    });
    return result;
  }

  public async approve(input: Omit<TransitionDraftCommand, 'tenantId'>): Promise<DraftRepositoryResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    const current = await this.assertTransitionReady(input, false);
    if (!current.guard.mayRequestApproval) throw new DraftBlockedError('guard_failed');
    return this.repository.approve({ ...input, tenantId: this.identity.tenantId });
  }

  public async export(input: Omit<TransitionDraftCommand, 'tenantId'>): Promise<DraftExport> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    const current = await this.assertTransitionReady(input, true);
    if (current.status !== 'approved' && current.status !== 'exported') {
      throw new DraftBlockedError('draft_not_approved');
    }
    const result = await this.repository.export({ ...input, tenantId: this.identity.tenantId });
    return {
      outcome: result.outcome,
      filename: `pr-${result.snapshot.channel}-draft-v${String(result.snapshot.revision)}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      content: result.snapshot.body,
      snapshot: result.snapshot,
    };
  }

  private async assertTransitionReady(
    input: Omit<TransitionDraftCommand, 'tenantId'>,
    allowExported: boolean,
  ): Promise<DraftWorkspaceSnapshot> {
    const current = await this.requiredCurrent(input.draftId);
    if (current.revision !== input.expectedRevision && !(allowExported && current.status === 'exported')) {
      throw new DraftConflictError('revision_changed');
    }
    const strategy = await this.strategy.snapshot(input.actorId);
    if (strategy.revision !== current.strategyRevision) throw new DraftBlockedError('strategy_changed');
    const claimStatus = await this.claimPolicy?.effectiveStatus(
      this.identity.tenantId,
      input.actorId,
      current.claimId,
      'verified' satisfies ClaimStatus,
    ) ?? 'verified';
    if (claimStatus !== 'verified') throw new DraftBlockedError('claim_not_verified');
    const source = await this.findSource(
      input.actorId,
      current.source.kind,
      current.source.ref,
      input.occurredAt,
    );
    if (!source) throw new DraftBlockedError('source_not_available');
    if (!sourceAuthorizedForContentAction(await this.workbench.snapshot(), source)) {
      throw new DraftBlockedError('source_not_authorized_for_action');
    }
    return current;
  }

  private async requiredCurrent(draftId: string): Promise<DraftWorkspaceSnapshot> {
    const current = await this.repository.find();
    if (!current || current.draftId !== draftId) throw new DraftNotFoundError();
    return current;
  }

  private async findSource(
    actorId: UserId,
    kind: DraftSourceKind,
    ref: string,
    at: Date,
  ): Promise<DraftSourceRecord | undefined> {
    return (await this.sources(actorId, at)).records.find(
      (record) => record.kind === kind && record.ref === ref,
    );
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new DraftPermissionError('Only the owner can manage drafts.');
  }
}

export class InMemoryDraftWorkspaceRepository implements DraftWorkspaceRepository {
  public readonly persistence = 'memory' as const;
  #current: DraftWorkspaceSnapshot | null = null;
  readonly #requests = new Map<string, Readonly<{ fingerprint: string; snapshot: DraftWorkspaceSnapshot }>>();

  public find(): Promise<DraftWorkspaceSnapshot | null> {
    return Promise.resolve(this.#current);
  }

  public create(command: CreateDraftCommand): Promise<DraftRepositoryResult> {
    return this.apply(command.requestId, commandFingerprint('create', command), () => ({
      draftId: command.draftId,
      claimId: command.claimId,
      revision: 1,
      strategyRevision: command.strategyRevision,
      channel: command.channel,
      body: command.body,
      adaptation: platformAdaptationFor(command.channel, command.body, command.adaptationProfileVersion),
      status: command.guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed',
      guard: command.guard,
      source: command.source,
      publicDraftingConsent: true,
      sourceAvailable: true,
      staleStrategy: false,
      updatedAt: command.occurredAt,
      persistence: this.persistence,
    }));
  }

  public edit(command: EditDraftCommand): Promise<DraftRepositoryResult> {
    return this.apply(command.requestId, commandFingerprint('edit', command), () => {
      const current = this.required(command.draftId, command.expectedRevision);
      return {
        draftId: current.draftId,
        claimId: current.claimId,
        revision: current.revision + 1,
        strategyRevision: current.strategyRevision,
        channel: current.channel,
        body: command.body,
        adaptation: platformAdaptationFor(current.channel, command.body, current.adaptation.version),
        status: command.guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed',
        guard: command.guard,
        source: current.source,
        publicDraftingConsent: true,
        sourceAvailable: current.sourceAvailable,
        staleStrategy: current.staleStrategy,
        updatedAt: command.occurredAt,
        persistence: current.persistence,
      };
    });
  }

  public approve(command: TransitionDraftCommand): Promise<DraftRepositoryResult> {
    return this.apply(command.requestId, commandFingerprint('approve', command), () => {
      const current = this.required(command.draftId, command.expectedRevision);
      if (!current.guard.mayRequestApproval) throw new DraftBlockedError('guard_failed');
      return {
        ...current,
        revision: current.revision + 1,
        status: 'approved',
        approvedAt: command.occurredAt,
        updatedAt: command.occurredAt,
      };
    });
  }

  public export(command: TransitionDraftCommand): Promise<DraftRepositoryResult> {
    return this.apply(command.requestId, commandFingerprint('export', command), () => {
      const current = this.required(command.draftId, command.expectedRevision);
      if (current.status !== 'approved') throw new DraftBlockedError('draft_not_approved');
      return {
        ...current,
        revision: current.revision + 1,
        status: 'exported',
        exportedAt: command.occurredAt,
        updatedAt: command.occurredAt,
      };
    });
  }

  private apply(
    requestId: string,
    fingerprint: string,
    mutation: () => DraftWorkspaceSnapshot,
  ): Promise<DraftRepositoryResult> {
    const existing = this.#requests.get(requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new DraftConflictError('idempotency_mismatch');
      return Promise.resolve({ outcome: 'already_applied', snapshot: existing.snapshot });
    }
    const snapshot = mutation();
    this.#current = snapshot;
    this.#requests.set(requestId, { fingerprint, snapshot });
    return Promise.resolve({ outcome: 'applied', snapshot });
  }

  private required(draftId: string, expectedRevision: number): DraftWorkspaceSnapshot {
    if (!this.#current || this.#current.draftId !== draftId) throw new DraftNotFoundError();
    if (this.#current.revision !== expectedRevision) throw new DraftConflictError('revision_changed');
    return this.#current;
  }
}

type DraftRow = Readonly<{
  draft_id: string;
  revision: string | number;
  strategy_revision: string | number;
  channel: DraftChannel;
  body: string;
  adaptation_profile_version: PlatformAdaptationProfileVersion;
  status: DraftWorkspaceStatus;
  guard_result: unknown;
  source_kind: DraftSourceKind;
  source_proposal_ref: string;
  source_assertion_id: string;
  claim_id: string;
  statement: string;
  evidence_ids: unknown;
  approved_at: Date | string | null;
  exported_at: Date | string | null;
  updated_at: Date | string;
}>;

type SourceRow = Readonly<{
  assertion_id: string;
  assertion_value: unknown;
  evidence_ids: unknown;
}>;

type RequestRow = Readonly<{ fingerprint: string; result_snapshot: unknown }>;

export class PostgresDraftWorkspaceRepository implements DraftWorkspaceRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public find(): Promise<DraftWorkspaceSnapshot | null> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return this.findWithin(transaction);
    });
  }

  public create(command: CreateDraftCommand): Promise<DraftRepositoryResult> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = commandFingerprint('create', command);
      const repeated = await reserveRequest(transaction, this.context, command, 'create', fingerprint);
      if (repeated) return { outcome: 'already_applied', snapshot: repeated };
      const sourceResult = command.source.kind === 'memory'
        ? await transaction.query<SourceRow>(
          `SELECT active.id AS assertion_id, active.value AS assertion_value,
                COALESCE(jsonb_agg(DISTINCT link.evidence_id::text)
                  FILTER (WHERE evidence.deleted_at IS NULL), '[]'::jsonb) AS evidence_ids
           FROM app.memory_proposals proposal
           JOIN app.assertions active
             ON active.tenant_id = proposal.tenant_id AND active.id = proposal.active_assertion_id
           JOIN app.assertion_evidence link
             ON link.tenant_id = active.tenant_id AND link.assertion_id = active.id
           JOIN app.evidence_items evidence
             ON evidence.tenant_id = link.tenant_id AND evidence.id = link.evidence_id
          WHERE proposal.tenant_id = $1 AND proposal.subject_user_id = $2
            AND proposal.external_ref = $3 AND proposal.status = 'confirmed'
            AND proposal.deleted_at IS NULL AND active.deleted_at IS NULL
            AND active.contested_at IS NULL AND active.valid_to IS NULL
            AND EXISTS (
              SELECT 1 FROM app.consent_grants grant_row
               WHERE grant_row.tenant_id = proposal.tenant_id
                 AND grant_row.subject_user_id = proposal.subject_user_id
                 AND grant_row.resource_type = 'assertion'
                 AND grant_row.resource_id = active.id::text
                 AND grant_row.purpose = 'brand_usage'
                 AND grant_row.operation = 'read' AND grant_row.revoked_at IS NULL
            )
          GROUP BY active.id, active.value`,
          [this.context.tenantId, this.context.ownerUserId, command.source.ref],
        )
        : await transaction.query<SourceRow>(
          `SELECT assertion.id AS assertion_id, assertion.value AS assertion_value,
                  jsonb_build_array(request.evidence_id::text) AS evidence_ids
             FROM app.asset_intake_requests request
             JOIN app.assets asset
               ON asset.tenant_id = request.tenant_id AND asset.id = request.asset_id
             JOIN app.evidence_items evidence
               ON evidence.tenant_id = request.tenant_id AND evidence.id = request.evidence_id
             JOIN app.assertions assertion
               ON assertion.tenant_id = request.tenant_id AND assertion.id = request.assertion_id
            WHERE request.tenant_id = $1 AND request.owner_user_id = $2
              AND request.asset_id = $3::uuid
              AND request.result_snapshot->'permissions'->>'brandUsage' = 'true'
              AND asset.deleted_at IS NULL AND evidence.deleted_at IS NULL
              AND assertion.deleted_at IS NULL AND assertion.contested_at IS NULL
              AND assertion.valid_to IS NULL`,
          [this.context.tenantId, this.context.ownerUserId, command.source.ref],
        );
      const source = sourceResult.rows[0];
      if (!source || source.assertion_id !== command.source.assertionId || source.assertion_value !== command.source.statement) {
        throw new DraftBlockedError('source_not_available');
      }
      const evidenceIds = stringArray(source.evidence_ids, 'Draft evidence IDs');
      if (!sameStrings(evidenceIds, command.source.evidenceIds) || evidenceIds.length === 0) {
        throw new DraftBlockedError('source_not_available');
      }
      await transaction.query(
        `INSERT INTO app.consent_grants (
           tenant_id, subject_user_id, granted_by, purpose, operation, data_class,
           audience, channel, policy_version, granted_at, resource_type, resource_id
         ) SELECT $1, $2, $2, 'public_drafting', grant_row.operation::app.consent_operation,
                  'confidential', 'owner_requested', $3, 'draft-consent-v1', $4,
                  'assertion', $5
             FROM unnest(ARRAY['read','process','derive']::text[]) AS grant_row(operation)`,
        [this.context.tenantId, this.context.ownerUserId, command.channel, command.occurredAt, source.assertion_id],
      );
      await transaction.query(
        `INSERT INTO app.claims (
           id, tenant_id, statement, kind, status, data_class, source_refs,
           allowed_purposes, allowed_channels, valid_from, verified_at,
           verified_by, created_at, created_by
         ) VALUES ($1, $2, $3, 'personal_fact', 'verified', 'confidential',
           '[]'::jsonb, ARRAY['public_drafting']::app.consent_purpose[], ARRAY[$4],
           $5, $5, $6, $5, $6)`,
        [command.claimId, this.context.tenantId, command.source.statement, command.channel, command.occurredAt, this.context.ownerUserId],
      );
      await transaction.query(
        `INSERT INTO app.claim_evidence (tenant_id, claim_id, evidence_id, relation, created_at)
         SELECT $1, $2, evidence_row.evidence_id, 'supports', $4
           FROM unnest($3::uuid[]) AS evidence_row(evidence_id)`,
        [this.context.tenantId, command.claimId, command.source.evidenceIds, command.occurredAt],
      );
      const status = command.guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed';
      await transaction.query(
        `INSERT INTO app.draft_artifacts (
           id, tenant_id, owner_user_id, workflow_id, channel, body, status,
           guard_result, source_kind, source_proposal_ref, source_assertion_id, strategy_revision,
           adaptation_profile_version,
           revision, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, 1, $3, $14, $14)`,
        [command.draftId, this.context.tenantId, this.context.ownerUserId, `draft:${command.draftId}`, command.channel, command.body, status, JSON.stringify(command.guard), command.source.kind, command.source.ref, command.source.assertionId, command.strategyRevision, command.adaptationProfileVersion, command.occurredAt],
      );
      await transaction.query(
        `INSERT INTO app.draft_claims (tenant_id, draft_id, claim_id, excerpt)
         VALUES ($1, $2, $3, $4)`,
        [this.context.tenantId, command.draftId, command.claimId, command.source.statement],
      );
      const snapshot = createSnapshot(command, status, this.persistence);
      await completeRequest(transaction, this.context, command.requestId, snapshot);
      await appendDraftEvents(transaction, this.context, command, snapshot, 'draft.created');
      return { outcome: 'applied', snapshot };
    });
  }

  public edit(command: EditDraftCommand): Promise<DraftRepositoryResult> {
    return this.transition('edit', command, async (transaction) => {
      const status = command.guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed';
      const result = await transaction.query<DraftRow>(
        `${draftUpdateCte()}
         UPDATE app.draft_artifacts draft SET
           body = $5, guard_result = $6::jsonb, status = $7,
           revision = draft.revision + 1, approved_by = NULL, approved_at = NULL,
           exported_at = NULL, updated_at = $8
          WHERE draft.tenant_id = $1 AND draft.owner_user_id = $2
            AND draft.id = $3 AND draft.revision = $4
         RETURNING ${draftReturningColumns()}`,
        [this.context.tenantId, this.context.ownerUserId, command.draftId, command.expectedRevision, command.body, JSON.stringify(command.guard), status, command.occurredAt],
      );
      return requiredDraftRow(result.rows[0], this.persistence);
    });
  }

  public approve(command: TransitionDraftCommand): Promise<DraftRepositoryResult> {
    return this.transition('approve', command, async (transaction) => {
      const result = await transaction.query<DraftRow>(
        `${draftUpdateCte()}
         UPDATE app.draft_artifacts draft SET
           status = 'approved', revision = draft.revision + 1,
           approved_by = $2, approved_at = $5, updated_at = $5
          WHERE draft.tenant_id = $1 AND draft.owner_user_id = $2
            AND draft.id = $3 AND draft.revision = $4
            AND draft.status = 'awaiting_approval'
            AND COALESCE(draft.guard_result->>'classification', 'red') <> 'red'
            AND (SELECT claim_status FROM claim_context) = 'verified'
         RETURNING ${draftReturningColumns()}`,
        [this.context.tenantId, this.context.ownerUserId, command.draftId, command.expectedRevision, command.occurredAt],
      );
      const row = result.rows[0];
      if (!row) throw new DraftBlockedError('guard_failed');
      return rowToSnapshot(row, this.persistence);
    });
  }

  public export(command: TransitionDraftCommand): Promise<DraftRepositoryResult> {
    return this.transition('export', command, async (transaction) => {
      const result = await transaction.query<DraftRow>(
        `${draftUpdateCte()}
         UPDATE app.draft_artifacts draft SET
           status = 'exported', revision = draft.revision + 1,
           exported_at = $5, updated_at = $5
          WHERE draft.tenant_id = $1 AND draft.owner_user_id = $2
            AND draft.id = $3 AND draft.revision = $4 AND draft.status = 'approved'
            AND (SELECT claim_status FROM claim_context) = 'verified'
         RETURNING ${draftReturningColumns()}`,
        [this.context.tenantId, this.context.ownerUserId, command.draftId, command.expectedRevision, command.occurredAt],
      );
      const row = result.rows[0];
      if (!row) throw new DraftBlockedError('draft_not_approved');
      return rowToSnapshot(row, this.persistence);
    });
  }

  private transition(
    operation: 'edit' | 'approve' | 'export',
    command: EditDraftCommand | TransitionDraftCommand,
    mutation: (transaction: SqlTransaction) => Promise<DraftWorkspaceSnapshot>,
  ): Promise<DraftRepositoryResult> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = commandFingerprint(operation, command);
      const repeated = await reserveRequest(transaction, this.context, command, operation, fingerprint);
      if (repeated) return { outcome: 'already_applied', snapshot: repeated };
      const snapshot = await mutation(transaction);
      await completeRequest(transaction, this.context, command.requestId, snapshot);
      await appendDraftEvents(transaction, this.context, command, snapshot, `draft.${operation}`);
      return { outcome: 'applied', snapshot };
    });
  }

  private async findWithin(transaction: SqlTransaction): Promise<DraftWorkspaceSnapshot | null> {
    const result = await transaction.query<DraftRow>(
      `${draftSelectColumns()}
         FROM app.draft_artifacts draft
         JOIN app.draft_claims draft_claim
           ON draft_claim.tenant_id = draft.tenant_id AND draft_claim.draft_id = draft.id
         JOIN app.claims claim
           ON claim.tenant_id = draft_claim.tenant_id AND claim.id = draft_claim.claim_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(jsonb_agg(link.evidence_id::text), '[]'::jsonb) AS evidence_ids
             FROM app.claim_evidence link
            WHERE link.tenant_id = claim.tenant_id AND link.claim_id = claim.id
         ) evidence ON true
        WHERE draft.tenant_id = $1 AND draft.owner_user_id = $2
        ORDER BY draft.updated_at DESC LIMIT 1`,
      [this.context.tenantId, this.context.ownerUserId],
    );
    return result.rows[0] ? rowToSnapshot(result.rows[0], this.persistence) : null;
  }

  private assertContext(command: BaseCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new DraftPermissionError('Draft repository context mismatch.');
    }
  }
}

function sourceAuthorizedForContentAction(
  workbench: WorkbenchSnapshot,
  source: DraftSourceRecord,
): boolean {
  if (
    workbench.workflow.status !== 'approved' ||
    workbench.workflow.approvedActionId !== 'essay' ||
    !workbench.workflow.approvedEvidenceIds ||
    source.evidenceIds.length === 0
  ) return false;
  const authorized = new Set(workbench.workflow.approvedEvidenceIds);
  return source.evidenceIds.every((id) => authorized.has(id));
}

function reviewBody(
  draftId: string,
  tenantId: TenantId,
  actorId: UserId,
  channel: DraftChannel,
  body: string,
  claimId: string,
  source: DraftWorkspaceSnapshot['source'],
  at: Date,
): DraftGuardResult {
  const claim = evidenceBoundClaim(claimId, tenantId, actorId, channel, source, at);
  const containsClaim = body.includes(source.statement);
  const remaining = body.replaceAll(source.statement, '');
  const extractionComplete = !hasPotentialUnboundFact(remaining);
  const guard = guardDraft(
    {
      id: draftId,
      tenantId,
      channel,
      purpose: 'public_drafting',
      body,
      claimExtractionComplete: extractionComplete,
      claims: containsClaim ? [{ claimId, excerpt: source.statement }] : [],
    },
    [claim],
    at,
  );
  const formatViolations: GuardViolation[] = platformFormatIssues(channel, body).map((message) => ({
    code: 'channel_format_violation',
    severity: 'red',
    claimId: 'draft',
    message,
  }));
  if (formatViolations.length === 0) return guard;
  return {
    classification: 'red',
    mayRequestApproval: false,
    violations: [...guard.violations, ...formatViolations],
  };
}

function evidenceBoundClaim(
  claimId: string,
  tenantId: TenantId,
  actorId: UserId,
  channel: DraftChannel,
  source: DraftWorkspaceSnapshot['source'],
  at: Date,
): Claim {
  return verifyClaim(
    proposeClaim({
      id: claimId,
      tenantId,
      statement: source.statement,
      kind: 'personal_fact',
      dataClass: 'confidential',
      evidenceIds: source.evidenceIds.map(evidenceId),
      sourceRefs: [],
      allowedPurposes: ['public_drafting'],
      allowedChannels: [channel],
      validFrom: at,
      createdAt: at,
      createdBy: actorId,
    }),
    actorId,
    at,
  );
}

function hasPotentialUnboundFact(text: string): boolean {
  return /[0-9۰-۹]|در\s+سال|درآمد|فروش|تعداد|درصد|جایزه|مدرک|دانشگاه|شرکت|بنیان.?گذار|according\s+to|research\s+shows/iu.test(text);
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new DraftValidationError('Draft request id is invalid.');
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new DraftValidationError(`${label} is invalid.`);
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function commandFingerprint(operation: string, command: object): string {
  return createHash('sha256').update(JSON.stringify({ operation, command })).digest('hex');
}

function createSnapshot(
  command: CreateDraftCommand,
  status: DraftWorkspaceStatus,
  persistence: DraftWorkspacePersistence,
): DraftWorkspaceSnapshot {
  return {
    draftId: command.draftId,
    claimId: command.claimId,
    revision: 1,
    strategyRevision: command.strategyRevision,
    channel: command.channel,
    body: command.body,
    adaptation: platformAdaptationFor(command.channel, command.body, command.adaptationProfileVersion),
    status,
    guard: command.guard,
    source: command.source,
    publicDraftingConsent: true,
    sourceAvailable: true,
    staleStrategy: false,
    updatedAt: command.occurredAt,
    persistence,
  };
}

function draftSelectColumns(): string {
  return `SELECT draft.id AS draft_id, draft.revision, draft.strategy_revision,
                 draft.channel, draft.body, draft.status, draft.guard_result,
                 draft.adaptation_profile_version,
                 draft.source_kind, draft.source_proposal_ref, draft.source_assertion_id,
                 claim.id AS claim_id, claim.statement, evidence.evidence_ids,
                 draft.approved_at, draft.exported_at, draft.updated_at`;
}

function draftUpdateCte(): string {
  return `WITH claim_context AS (
    SELECT draft_claim.draft_id, claim.id AS claim_id, claim.statement, claim.status AS claim_status,
           COALESCE(jsonb_agg(link.evidence_id::text), '[]'::jsonb) AS evidence_ids
      FROM app.draft_claims draft_claim
      JOIN app.claims claim ON claim.tenant_id = draft_claim.tenant_id AND claim.id = draft_claim.claim_id
      LEFT JOIN app.claim_evidence link ON link.tenant_id = claim.tenant_id AND link.claim_id = claim.id
     WHERE draft_claim.tenant_id = $1 AND draft_claim.draft_id = $3
     GROUP BY draft_claim.draft_id, claim.id, claim.statement, claim.status
  )`;
}

function draftReturningColumns(): string {
  return `draft.id AS draft_id, draft.revision, draft.strategy_revision,
    draft.channel, draft.body, draft.status, draft.guard_result,
    draft.adaptation_profile_version,
    draft.source_kind, draft.source_proposal_ref, draft.source_assertion_id,
    (SELECT claim_id FROM claim_context) AS claim_id,
    (SELECT statement FROM claim_context) AS statement,
    (SELECT evidence_ids FROM claim_context) AS evidence_ids,
    draft.approved_at, draft.exported_at, draft.updated_at`;
}

function requiredDraftRow(
  row: DraftRow | undefined,
  persistence: DraftWorkspacePersistence,
): DraftWorkspaceSnapshot {
  if (!row) throw new DraftConflictError('revision_changed');
  return rowToSnapshot(row, persistence);
}

function rowToSnapshot(row: DraftRow, persistence: DraftWorkspacePersistence): DraftWorkspaceSnapshot {
  const revision = Number(row.revision);
  const strategyRevision = Number(row.strategy_revision);
  if (!Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(strategyRevision) || strategyRevision < 1) {
    throw new Error('Stored draft revisions are invalid.');
  }
  return {
    draftId: row.draft_id,
    claimId: row.claim_id,
    revision,
    strategyRevision,
    channel: row.channel,
    body: row.body,
    adaptation: platformAdaptationFor(row.channel, row.body, row.adaptation_profile_version),
    status: row.status,
    guard: parseGuard(row.guard_result),
    source: {
      kind: row.source_kind,
      ref: row.source_proposal_ref,
      label: row.statement.slice(0, 120),
      assertionId: row.source_assertion_id,
      statement: row.statement,
      evidenceIds: stringArray(row.evidence_ids, 'Draft evidence IDs'),
      sourceTypes: [row.source_kind === 'text_asset' ? 'text_asset' : 'conversation_turn'],
    },
    publicDraftingConsent: true,
    sourceAvailable: true,
    staleStrategy: false,
    ...(row.approved_at ? { approvedAt: toDate(row.approved_at, 'Draft approval') } : {}),
    ...(row.exported_at ? { exportedAt: toDate(row.exported_at, 'Draft export') } : {}),
    updatedAt: toDate(row.updated_at, 'Draft update'),
    persistence,
  };
}

function parseGuard(value: unknown): DraftGuardResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored draft guard is invalid.');
  const record = value as Record<string, unknown>;
  if (
    !['green', 'yellow', 'red'].includes(String(record['classification'])) ||
    typeof record['mayRequestApproval'] !== 'boolean' ||
    !Array.isArray(record['violations'])
  ) throw new Error('Stored draft guard is invalid.');
  return {
    classification: record['classification'] as DraftGuardResult['classification'],
    mayRequestApproval: record['mayRequestApproval'],
    violations: record['violations'] as GuardViolation[],
  };
}

async function reserveRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: BaseCommand,
  operation: 'create' | 'edit' | 'approve' | 'export',
  fingerprint: string,
): Promise<DraftWorkspaceSnapshot | null> {
  const inserted = await transaction.query(
    `INSERT INTO app.draft_workspace_requests (
       tenant_id, owner_user_id, client_ref, operation, fingerprint, requested_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, owner_user_id, client_ref) DO NOTHING
     RETURNING client_ref`,
    [context.tenantId, context.ownerUserId, command.requestId, operation, fingerprint, command.occurredAt],
  );
  if (inserted.rowCount === 1) return null;
  const existing = await transaction.query<RequestRow>(
    `SELECT fingerprint, result_snapshot FROM app.draft_workspace_requests
      WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
    [context.tenantId, context.ownerUserId, command.requestId],
  );
  const row = existing.rows[0];
  if (!row || row.fingerprint !== fingerprint || !row.result_snapshot) {
    throw new DraftConflictError('idempotency_mismatch');
  }
  return parseStoredSnapshot(row.result_snapshot);
}

async function completeRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  snapshot: DraftWorkspaceSnapshot,
): Promise<void> {
  await transaction.query(
    `UPDATE app.draft_workspace_requests SET result_snapshot = $4::jsonb
      WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
    [context.tenantId, context.ownerUserId, requestId, JSON.stringify(serializeSnapshot(snapshot))],
  );
}

async function appendDraftEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: BaseCommand,
  snapshot: DraftWorkspaceSnapshot,
  eventType: string,
): Promise<void> {
  const metadata = JSON.stringify({
    requestId: command.requestId,
    revision: snapshot.revision,
    strategyRevision: snapshot.strategyRevision,
    channel: snapshot.channel,
    guard: snapshot.guard.classification,
    sourceAssertionId: snapshot.source.assertionId,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, 'draft', $4, 'public_drafting', $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, eventType, snapshot.draftId, snapshot.status, metadata, command.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'draft', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, snapshot.draftId, eventType, metadata, command.occurredAt],
  );
}

function serializeSnapshot(snapshot: DraftWorkspaceSnapshot): Record<string, unknown> {
  return {
    ...snapshot,
    updatedAt: snapshot.updatedAt.toISOString(),
    ...(snapshot.approvedAt ? { approvedAt: snapshot.approvedAt.toISOString() } : {}),
    ...(snapshot.exportedAt ? { exportedAt: snapshot.exportedAt.toISOString() } : {}),
  };
}

function parseStoredSnapshot(value: unknown): DraftWorkspaceSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored draft request result is invalid.');
  const record = value as Record<string, unknown>;
  const source = record['source'];
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Stored draft source is invalid.');
  const sourceRecord = source as Record<string, unknown>;
  return {
    draftId: stringValue(record['draftId']),
    claimId: stringValue(record['claimId']),
    revision: Number(record['revision']),
    strategyRevision: Number(record['strategyRevision']),
    channel: stringValue(record['channel']) as DraftChannel,
    body: stringValue(record['body']),
    adaptation: parseStoredAdaptation(record),
    status: stringValue(record['status']) as DraftWorkspaceStatus,
    guard: parseGuard(record['guard']),
    source: {
      kind: sourceRecord['kind'] === 'text_asset' ? 'text_asset' : 'memory',
      ref: typeof sourceRecord['ref'] === 'string'
        ? sourceRecord['ref']
        : stringValue(sourceRecord['proposalId']),
      label: typeof sourceRecord['label'] === 'string'
        ? sourceRecord['label']
        : stringValue(sourceRecord['statement']).slice(0, 120),
      assertionId: stringValue(sourceRecord['assertionId']),
      statement: stringValue(sourceRecord['statement']),
      evidenceIds: stringArray(sourceRecord['evidenceIds'], 'Draft evidence IDs'),
      sourceTypes: Array.isArray(sourceRecord['sourceTypes'])
        ? stringArray(sourceRecord['sourceTypes'], 'Draft source types')
        : ['conversation_turn'],
    },
    publicDraftingConsent: true,
    sourceAvailable: record['sourceAvailable'] !== false,
    staleStrategy: record['staleStrategy'] === true,
    ...(typeof record['approvedAt'] === 'string' ? { approvedAt: new Date(record['approvedAt']) } : {}),
    ...(typeof record['exportedAt'] === 'string' ? { exportedAt: new Date(record['exportedAt']) } : {}),
    updatedAt: new Date(stringValue(record['updatedAt'])),
    persistence: record['persistence'] === 'postgres' ? 'postgres' : 'memory',
  };
}

function parseStoredAdaptation(record: Record<string, unknown>): PlatformAdaptationSnapshot {
  const channel = stringValue(record['channel']) as DraftChannel;
  const body = stringValue(record['body']);
  const adaptation = record['adaptation'];
  const version = adaptation && typeof adaptation === 'object' && !Array.isArray(adaptation)
    ? (adaptation as Record<string, unknown>)['version']
    : undefined;
  return platformAdaptationFor(
    channel,
    body,
    version === platformAdaptationProfileVersion ? version : platformAdaptationProfileVersion,
  );
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${label} are invalid.`);
  return value as string[];
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Stored draft string is invalid.');
  return value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function toDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date;
}
