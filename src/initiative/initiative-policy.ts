import { createHash } from 'node:crypto';
import type { ArbitrationWorkspaceSnapshot, DecisionArbitrationService } from '../arbitration/decision-arbitration.js';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { WorkbenchAction, WorkbenchService, WorkbenchSnapshot } from '../workbench/workbench.js';

export const initiativePolicyVersion = 'initiative-policy-v1' as const;

export type InitiativeMode = 'reactive' | 'balanced' | 'proactive';
export type InitiativeCueKind = 'evidence_question' | 'action_window' | 'decision_refresh';
export type InitiativeTargetView = 'intake' | 'today' | 'arbitration';
export type InitiativeDecision = 'delivered' | 'suppressed';
export type InitiativeDecisionReason =
  | 'delivered'
  | 'reactive_mode'
  | 'paused'
  | 'rate_limited'
  | 'below_relevance'
  | 'no_material_signal';

export type EditableInitiativeSettings = Readonly<{
  mode: InitiativeMode;
  maxPromptsPer24Hours: 1 | 2 | 3;
  minimumRelevance: number;
  pausedUntil: string | null;
}>;

export type InitiativeSettingsSnapshot = EditableInitiativeSettings & Readonly<{
  revision: number;
  updatedAt: string;
  persistence: 'memory' | 'postgres';
}>;

export type InitiativeCueCandidate = Readonly<{
  candidateId: string;
  kind: InitiativeCueKind;
  title: string;
  prompt: string;
  rationale: string;
  relevance: number;
  confidence: number;
  targetView: InitiativeTargetView;
  sourceRefs: readonly string[];
  contextHash: string;
  expiresAt: string;
}>;

export type InitiativeEvaluation = Readonly<{
  evaluationId: string;
  requestId: string;
  policyVersion: typeof initiativePolicyVersion;
  settingsRevision: number;
  contextHash: string;
  candidate: InitiativeCueCandidate | null;
  decision: InitiativeDecision;
  reason: InitiativeDecisionReason;
  createdAt: string;
}>;

export type InitiativeWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres';
  policyVersion: typeof initiativePolicyVersion;
  settings: InitiativeSettingsSnapshot;
  window: Readonly<{
    startsAt: string;
    delivered: number;
    remaining: number;
  }>;
  preview: Readonly<{
    candidate: InitiativeCueCandidate | null;
    decision: InitiativeDecision;
    reason: InitiativeDecisionReason;
  }>;
  evaluations: readonly Readonly<InitiativeEvaluation & { stale: boolean }>[];
}>;

export type InitiativeRepositoryState = Readonly<{
  settings: InitiativeSettingsSnapshot;
  evaluations: readonly InitiativeEvaluation[];
}>;

export type UpdateInitiativeSettingsCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  expectedRevision: number;
  value: EditableInitiativeSettings;
  occurredAt: Date;
}>;

export type UpdateInitiativeSettingsResult = Readonly<{
  outcome: 'saved' | 'already_saved';
  settings: InitiativeSettingsSnapshot;
}>;

export type EvaluateInitiativeCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  contextHash: string;
  candidate: InitiativeCueCandidate | null;
  occurredAt: Date;
}>;

export type EvaluateInitiativeResult = Readonly<{
  outcome: 'evaluated' | 'already_evaluated';
  evaluation: InitiativeEvaluation;
  persistence: 'memory' | 'postgres';
}>;

export interface InitiativeRepository {
  readonly persistence: 'memory' | 'postgres';
  read(tenantId: TenantId, actorId: UserId): Promise<InitiativeRepositoryState>;
  updateSettings(command: UpdateInitiativeSettingsCommand): Promise<UpdateInitiativeSettingsResult>;
  evaluate(command: EvaluateInitiativeCommand): Promise<Omit<EvaluateInitiativeResult, 'persistence'>>;
}

export class InitiativeValidationError extends Error {}
export class InitiativePermissionError extends Error {}
export class InitiativeConflictError extends Error {
  public constructor(public readonly reason: 'revision_changed' | 'idempotency_mismatch') {
    super(`Initiative conflict: ${reason}`);
  }
}

type InitiativeContext = Readonly<{
  workbench: WorkbenchSnapshot;
  arbitration: ArbitrationWorkspaceSnapshot;
  contextHash: string;
}>;

export class InitiativePolicyService {
  public constructor(
    private readonly repository: InitiativeRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly dependencies: Readonly<{
      workbench: Pick<WorkbenchService, 'snapshot'>;
      arbitration: Pick<DecisionArbitrationService, 'snapshot'>;
    }>,
  ) {}

  public async snapshot(actorId: UserId, at: Date): Promise<InitiativeWorkspaceSnapshot> {
    this.assertOwner(actorId);
    validateDate(at);
    const [state, context] = await Promise.all([
      this.repository.read(this.identity.tenantId, actorId),
      this.loadContext(actorId, at),
    ]);
    const candidate = buildInitiativeCandidate(context, at);
    const preview = decideInitiative(state.settings, state.evaluations, candidate, at);
    return workspaceSnapshot(state, context.contextHash, candidate, preview, at);
  }

  public updateSettings(input: Omit<UpdateInitiativeSettingsCommand, 'tenantId'>): Promise<UpdateInitiativeSettingsResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateDate(input.occurredAt);
    validateInitiativeSettings(input.value, input.occurredAt);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new InitiativeValidationError('Initiative settings revision is invalid.');
    }
    return this.repository.updateSettings({ ...input, tenantId: this.identity.tenantId });
  }

  public async evaluate(input: Readonly<{
    actorId: UserId;
    requestId: string;
    occurredAt: Date;
  }>): Promise<EvaluateInitiativeResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateDate(input.occurredAt);
    const context = await this.loadContext(input.actorId, input.occurredAt);
    const candidate = buildInitiativeCandidate(context, input.occurredAt);
    const result = await this.repository.evaluate({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      contextHash: context.contextHash,
      candidate,
      occurredAt: input.occurredAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  private async loadContext(actorId: UserId, at: Date): Promise<InitiativeContext> {
    const [workbench, arbitration] = await Promise.all([
      this.dependencies.workbench.snapshot(),
      this.dependencies.arbitration.snapshot(actorId, at),
    ]);
    return {
      workbench,
      arbitration,
      contextHash: initiativeContextHash(workbench, arbitration),
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new InitiativePermissionError('Only the owner can configure proactive prompts.');
    }
  }
}

export class InMemoryInitiativeRepository implements InitiativeRepository {
  public readonly persistence = 'memory' as const;
  #settings: InitiativeSettingsSnapshot;
  readonly #evaluations: InitiativeEvaluation[] = [];
  readonly #settingsRequests = new Map<string, Readonly<{ fingerprint: string; settings: InitiativeSettingsSnapshot }>>();
  readonly #evaluationRequests = new Map<string, Readonly<{ fingerprint: string; evaluation: InitiativeEvaluation }>>();

  public constructor(initial: InitiativeSettingsSnapshot = defaultInitiativeSettings('memory')) {
    this.#settings = { ...initial, persistence: this.persistence };
  }

  public read(): Promise<InitiativeRepositoryState> {
    return Promise.resolve({ settings: this.#settings, evaluations: [...this.#evaluations] });
  }

  public updateSettings(command: UpdateInitiativeSettingsCommand): Promise<UpdateInitiativeSettingsResult> {
    const fingerprint = settingsFingerprint(command);
    const repeated = this.#settingsRequests.get(command.requestId);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new InitiativeConflictError('idempotency_mismatch');
      return Promise.resolve({ outcome: 'already_saved', settings: repeated.settings });
    }
    if (command.expectedRevision !== this.#settings.revision) {
      throw new InitiativeConflictError('revision_changed');
    }
    this.#settings = {
      ...command.value,
      revision: command.expectedRevision + 1,
      updatedAt: command.occurredAt.toISOString(),
      persistence: this.persistence,
    };
    this.#settingsRequests.set(command.requestId, { fingerprint, settings: this.#settings });
    return Promise.resolve({ outcome: 'saved', settings: this.#settings });
  }

  public evaluate(command: EvaluateInitiativeCommand): Promise<Omit<EvaluateInitiativeResult, 'persistence'>> {
    const fingerprint = evaluationFingerprint(command);
    const repeated = this.#evaluationRequests.get(command.requestId);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new InitiativeConflictError('idempotency_mismatch');
      return Promise.resolve({ outcome: 'already_evaluated', evaluation: repeated.evaluation });
    }
    const decision = decideInitiative(this.#settings, this.#evaluations, command.candidate, command.occurredAt);
    const evaluation = createEvaluation(command, this.#settings, decision);
    this.#evaluations.unshift(evaluation);
    this.#evaluationRequests.set(command.requestId, { fingerprint, evaluation });
    return Promise.resolve({ outcome: 'evaluated', evaluation });
  }
}

type SettingsRow = Readonly<{
  mode: InitiativeMode;
  max_prompts_per_24_hours: string | number;
  minimum_relevance: string | number;
  paused_until: Date | string | null;
  revision: string | number;
  updated_at: Date | string;
}>;

type StoredResultRow = Readonly<{
  request_sha256: string;
  result_snapshot: unknown;
}>;

type EvaluationRow = Readonly<{ result_snapshot: unknown }>;

export class PostgresInitiativeRepository implements InitiativeRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public read(tenantId: TenantId, actorId: UserId): Promise<InitiativeRepositoryState> {
    this.assertContext(tenantId, actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const [settings, evaluations] = await Promise.all([
        this.readSettingsWithin(transaction),
        transaction.query<EvaluationRow>(
          `SELECT result_snapshot FROM app.initiative_evaluations
            WHERE tenant_id = $1 AND owner_user_id = $2
            ORDER BY created_at DESC, id DESC LIMIT 50`,
          [this.context.tenantId, this.context.ownerUserId],
        ),
      ]);
      return {
        settings,
        evaluations: evaluations.rows.map((row) => parseEvaluation(row.result_snapshot)),
      };
    });
  }

  public updateSettings(command: UpdateInitiativeSettingsCommand): Promise<UpdateInitiativeSettingsResult> {
    this.assertContext(command.tenantId, command.actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:initiative:settings`,
      ]);
      const fingerprint = settingsFingerprint(command);
      const repeated = await transaction.query<StoredResultRow>(
        `SELECT request_sha256, result_snapshot FROM app.initiative_setting_requests
          WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const prior = repeated.rows[0];
      if (prior) {
        if (prior.request_sha256 !== fingerprint) throw new InitiativeConflictError('idempotency_mismatch');
        return { outcome: 'already_saved' as const, settings: parseSettings(prior.result_snapshot) };
      }
      const current = await this.readSettingsWithin(transaction, true);
      if (current.revision !== command.expectedRevision) throw new InitiativeConflictError('revision_changed');
      const settings: InitiativeSettingsSnapshot = {
        ...command.value,
        revision: command.expectedRevision + 1,
        updatedAt: command.occurredAt.toISOString(),
        persistence: this.persistence,
      };
      const updated = await transaction.query(
        `INSERT INTO app.initiative_settings (
           tenant_id, owner_user_id, mode, max_prompts_per_24_hours,
           minimum_relevance, paused_until, revision, updated_by, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $2, $8)
         ON CONFLICT (tenant_id, owner_user_id) DO UPDATE SET
           mode = EXCLUDED.mode,
           max_prompts_per_24_hours = EXCLUDED.max_prompts_per_24_hours,
           minimum_relevance = EXCLUDED.minimum_relevance,
           paused_until = EXCLUDED.paused_until,
           revision = EXCLUDED.revision,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at
         WHERE app.initiative_settings.revision = $9`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          settings.mode,
          settings.maxPromptsPer24Hours,
          settings.minimumRelevance,
          settings.pausedUntil,
          settings.revision,
          settings.updatedAt,
          command.expectedRevision,
        ],
      );
      if (updated.rowCount !== 1) throw new InitiativeConflictError('revision_changed');
      await transaction.query(
        `INSERT INTO app.initiative_setting_requests (
           tenant_id, owner_user_id, client_ref, request_sha256, result_snapshot, created_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.requestId,
          fingerprint,
          JSON.stringify(settings),
          command.occurredAt,
        ],
      );
      await appendInitiativeAudit(transaction, this.context, {
        eventType: 'initiative.settings_updated',
        resourceType: 'initiative_settings',
        resourceId: this.context.ownerUserId,
        decision: settings.mode,
        occurredAt: command.occurredAt,
        metadata: { requestId: command.requestId, revision: settings.revision, mode: settings.mode },
      });
      return { outcome: 'saved' as const, settings };
    });
  }

  public evaluate(command: EvaluateInitiativeCommand): Promise<Omit<EvaluateInitiativeResult, 'persistence'>> {
    this.assertContext(command.tenantId, command.actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:initiative:evaluate`,
      ]);
      const fingerprint = evaluationFingerprint(command);
      const repeated = await transaction.query<StoredResultRow>(
        `SELECT request_sha256, result_snapshot FROM app.initiative_evaluations
          WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const prior = repeated.rows[0];
      if (prior) {
        if (prior.request_sha256 !== fingerprint) throw new InitiativeConflictError('idempotency_mismatch');
        return { outcome: 'already_evaluated' as const, evaluation: parseEvaluation(prior.result_snapshot) };
      }
      const settings = await this.readSettingsWithin(transaction, true);
      const recent = await transaction.query<EvaluationRow>(
        `SELECT result_snapshot FROM app.initiative_evaluations
          WHERE tenant_id = $1 AND owner_user_id = $2 AND created_at >= $3
          ORDER BY created_at DESC`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          new Date(command.occurredAt.getTime() - initiativeWindowMilliseconds),
        ],
      );
      const evaluations = recent.rows.map((row) => parseEvaluation(row.result_snapshot));
      const decision = decideInitiative(settings, evaluations, command.candidate, command.occurredAt);
      const evaluation = createEvaluation(command, settings, decision);
      await transaction.query(
        `INSERT INTO app.initiative_evaluations (
           id, tenant_id, owner_user_id, client_ref, request_sha256, context_sha256,
           policy_version, decision, reason, relevance_score, result_snapshot, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
        [
          evaluation.evaluationId,
          this.context.tenantId,
          this.context.ownerUserId,
          evaluation.requestId,
          fingerprint,
          evaluation.contextHash,
          evaluation.policyVersion,
          evaluation.decision,
          evaluation.reason,
          evaluation.candidate?.relevance ?? null,
          JSON.stringify(evaluation),
          evaluation.createdAt,
        ],
      );
      await appendInitiativeAudit(transaction, this.context, {
        eventType: 'initiative.evaluated',
        resourceType: 'initiative_evaluation',
        resourceId: evaluation.evaluationId,
        decision: evaluation.decision,
        occurredAt: command.occurredAt,
        metadata: {
          requestId: command.requestId,
          reason: evaluation.reason,
          candidateId: evaluation.candidate?.candidateId ?? null,
          relevance: evaluation.candidate?.relevance ?? null,
          settingsRevision: evaluation.settingsRevision,
        },
      });
      return { outcome: 'evaluated' as const, evaluation };
    });
  }

  private async readSettingsWithin(
    transaction: SqlTransaction,
    forUpdate = false,
  ): Promise<InitiativeSettingsSnapshot> {
    const result = await transaction.query<SettingsRow>(
      `SELECT mode, max_prompts_per_24_hours, minimum_relevance, paused_until,
              revision, updated_at
         FROM app.initiative_settings
        WHERE tenant_id = $1 AND owner_user_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [this.context.tenantId, this.context.ownerUserId],
    );
    return result.rows[0]
      ? settingsFromRow(result.rows[0], this.persistence)
      : defaultInitiativeSettings(this.persistence);
  }

  private assertContext(tenantId: TenantId, actorId: UserId): void {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new InitiativePermissionError('Initiative repository context mismatch.');
    }
  }
}

const initiativeWindowMilliseconds = 24 * 60 * 60 * 1000;

export function defaultInitiativeSettings(
  persistence: InitiativeSettingsSnapshot['persistence'] = 'memory',
): InitiativeSettingsSnapshot {
  return {
    mode: 'reactive',
    maxPromptsPer24Hours: 1,
    minimumRelevance: 0.75,
    pausedUntil: null,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    persistence,
  };
}

export function decideInitiative(
  settings: InitiativeSettingsSnapshot,
  evaluations: readonly InitiativeEvaluation[],
  candidate: InitiativeCueCandidate | null,
  at: Date,
): Readonly<{ decision: InitiativeDecision; reason: InitiativeDecisionReason }> {
  if (settings.mode === 'reactive') return { decision: 'suppressed', reason: 'reactive_mode' };
  if (settings.pausedUntil && new Date(settings.pausedUntil).getTime() > at.getTime()) {
    return { decision: 'suppressed', reason: 'paused' };
  }
  if (!candidate) return { decision: 'suppressed', reason: 'no_material_signal' };
  if (candidate.relevance < settings.minimumRelevance) {
    return { decision: 'suppressed', reason: 'below_relevance' };
  }
  const delivered = deliveredWithinWindow(evaluations, at);
  if (delivered >= settings.maxPromptsPer24Hours) {
    return { decision: 'suppressed', reason: 'rate_limited' };
  }
  return { decision: 'delivered', reason: 'delivered' };
}

export function validateInitiativeSettings(
  value: EditableInitiativeSettings,
  at: Date,
): EditableInitiativeSettings {
  if (!['reactive', 'balanced', 'proactive'].includes(value.mode)) {
    throw new InitiativeValidationError('Initiative mode is invalid.');
  }
  if (![1, 2, 3].includes(value.maxPromptsPer24Hours)) {
    throw new InitiativeValidationError('Initiative rate limit is invalid.');
  }
  if (!Number.isFinite(value.minimumRelevance) || value.minimumRelevance < 0.5 || value.minimumRelevance > 0.95) {
    throw new InitiativeValidationError('Initiative relevance threshold is invalid.');
  }
  if (value.pausedUntil !== null) {
    const paused = new Date(value.pausedUntil);
    if (Number.isNaN(paused.getTime()) || paused.getTime() <= at.getTime() || paused.getTime() > at.getTime() + 30 * initiativeWindowMilliseconds) {
      throw new InitiativeValidationError('Initiative pause window is invalid.');
    }
  }
  return value;
}

function buildInitiativeCandidate(context: InitiativeContext, at: Date): InitiativeCueCandidate | null {
  const staleDecision = context.arbitration.cases.find((item) => item.stale);
  if (staleDecision) {
    return candidate({
      kind: 'decision_refresh',
      title: 'این تصمیم به Context قدیمی متکی است',
      prompt: 'مایلی رأی ماژول‌ها را با Strategy، Risk و Claim فعلی دوباره جمع‌آوری کنیم؟',
      rationale: 'Snapshot داوری پس از تغییر Context یا پایان پنجره اعتبار stale شده است.',
      relevance: 0.95,
      confidence: 1,
      targetView: 'arbitration',
      sourceRefs: [`arbitration_case:${staleDecision.caseId}`, `snapshot:${staleDecision.snapshotHash}`],
      contextHash: context.contextHash,
      at,
    });
  }
  if (context.workbench.evidence.state === 'insufficient') {
    return candidate({
      kind: 'evidence_question',
      title: 'یک سؤال کوتاه برای کم‌کردن حدس',
      prompt: 'درباره یک موقعیت واقعی که شیوه تصمیم‌گیری تو را نشان می‌دهد، چه تجربه‌ای ارزش ثبت‌کردن دارد؟',
      rationale: 'Evidence کافی برای توصیه استراتژیک وجود ندارد؛ یک پاسخ اختیاری Information Gain بالاتری از تولید محتوای حدسی دارد.',
      relevance: 0.9,
      confidence: 0.9,
      targetView: 'intake',
      sourceRefs: [
        `strategy_revision:${String(context.workbench.goal.revision)}`,
        `evidence_count:${String(context.workbench.evidence.strategyEvidenceCount)}`,
      ],
      contextHash: context.contextHash,
      at,
    });
  }
  const action = [...context.workbench.actions]
    .filter((item) => item.kind !== 'no_action' && item.feasible && item.evidenceState === 'grounded')
    .sort((left, right) => left.rank - right.rank)[0];
  if (!action) return null;
  const relevance = roundScore(Math.min(
    0.95,
    Math.max(0.5, 0.52 + action.confidence * 0.4 - Math.min(action.attentionCostMinutes / 1000, 0.12)),
  ));
  return candidate({
    kind: 'action_window',
    title: 'یک حرکت مرتبط با مسیر فعلی آماده بررسی است',
    prompt: `مایلی «${action.title}» را باز کنیم و قبل از هر اقدام، Evidence و Risk آن را ببینی؟`,
    rationale: 'این Cue از Action رتبه‌دار، Evidence مجاز، امکان‌پذیری و Attention Cost ساخته شده و به معنی الزام به اقدام نیست.',
    relevance,
    confidence: action.confidence,
    targetView: 'today',
    sourceRefs: [`action:${action.id}`, ...action.evidenceIds.map((id) => `evidence:${id}`)],
    contextHash: context.contextHash,
    at,
  });
}

function candidate(input: Readonly<{
  kind: InitiativeCueKind;
  title: string;
  prompt: string;
  rationale: string;
  relevance: number;
  confidence: number;
  targetView: InitiativeTargetView;
  sourceRefs: readonly string[];
  contextHash: string;
  at: Date;
}>): InitiativeCueCandidate {
  return {
    candidateId: deterministicUuid(`initiative:${input.kind}:${input.contextHash}`),
    kind: input.kind,
    title: input.title,
    prompt: input.prompt,
    rationale: input.rationale,
    relevance: input.relevance,
    confidence: input.confidence,
    targetView: input.targetView,
    sourceRefs: input.sourceRefs,
    contextHash: input.contextHash,
    expiresAt: new Date(input.at.getTime() + initiativeWindowMilliseconds).toISOString(),
  };
}

function initiativeContextHash(
  workbench: WorkbenchSnapshot,
  arbitration: ArbitrationWorkspaceSnapshot,
): string {
  return sha256(JSON.stringify({
    policyVersion: initiativePolicyVersion,
    goalRevision: workbench.goal.revision,
    evidence: workbench.evidence,
    actions: workbench.actions.map((action) => actionContext(action)),
    arbitration: arbitration.cases.map((item) => ({
      caseId: item.caseId,
      snapshotHash: item.snapshotHash,
      contextHash: item.contextHash,
      stale: item.stale,
    })),
  }));
}

function actionContext(action: WorkbenchAction): Record<string, unknown> {
  return {
    id: action.id,
    kind: action.kind,
    rank: action.rank,
    feasible: action.feasible,
    evidenceIds: action.evidenceIds,
    evidenceState: action.evidenceState,
    confidence: action.confidence,
    attentionCostMinutes: action.attentionCostMinutes,
    riskLevel: action.riskLevel,
  };
}

function workspaceSnapshot(
  state: InitiativeRepositoryState,
  currentContextHash: string,
  candidateValue: InitiativeCueCandidate | null,
  preview: Readonly<{ decision: InitiativeDecision; reason: InitiativeDecisionReason }>,
  at: Date,
): InitiativeWorkspaceSnapshot {
  const delivered = deliveredWithinWindow(state.evaluations, at);
  return {
    generatedAt: at.toISOString(),
    persistence: state.settings.persistence,
    policyVersion: initiativePolicyVersion,
    settings: state.settings,
    window: {
      startsAt: new Date(at.getTime() - initiativeWindowMilliseconds).toISOString(),
      delivered,
      remaining: Math.max(0, state.settings.maxPromptsPer24Hours - delivered),
    },
    preview: { candidate: candidateValue, ...preview },
    evaluations: state.evaluations.map((evaluation) => ({
      ...evaluation,
      stale:
        evaluation.contextHash !== currentContextHash ||
        (evaluation.candidate !== null && new Date(evaluation.candidate.expiresAt).getTime() <= at.getTime()),
    })),
  };
}

function deliveredWithinWindow(evaluations: readonly InitiativeEvaluation[], at: Date): number {
  const startsAt = at.getTime() - initiativeWindowMilliseconds;
  return evaluations.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    return item.decision === 'delivered' && createdAt >= startsAt && createdAt <= at.getTime();
  }).length;
}

function createEvaluation(
  command: EvaluateInitiativeCommand,
  settings: InitiativeSettingsSnapshot,
  decision: Readonly<{ decision: InitiativeDecision; reason: InitiativeDecisionReason }>,
): InitiativeEvaluation {
  return {
    evaluationId: deterministicUuid(`initiative-evaluation:${command.tenantId}:${command.actorId}:${command.requestId}`),
    requestId: command.requestId,
    policyVersion: initiativePolicyVersion,
    settingsRevision: settings.revision,
    contextHash: command.contextHash,
    candidate: command.candidate,
    ...decision,
    createdAt: command.occurredAt.toISOString(),
  };
}

function settingsFingerprint(command: UpdateInitiativeSettingsCommand): string {
  return sha256(JSON.stringify({
    policyVersion: initiativePolicyVersion,
    tenantId: command.tenantId,
    actorId: command.actorId,
    expectedRevision: command.expectedRevision,
    value: command.value,
  }));
}

function evaluationFingerprint(command: EvaluateInitiativeCommand): string {
  return sha256(JSON.stringify({
    policyVersion: initiativePolicyVersion,
    tenantId: command.tenantId,
    actorId: command.actorId,
    contextHash: command.contextHash,
    candidateId: command.candidate?.candidateId ?? null,
  }));
}

function settingsFromRow(
  row: SettingsRow,
  persistence: InitiativeSettingsSnapshot['persistence'],
): InitiativeSettingsSnapshot {
  const updatedAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  const pausedUntil = row.paused_until === null
    ? null
    : (row.paused_until instanceof Date ? row.paused_until : new Date(row.paused_until)).toISOString();
  const settings: InitiativeSettingsSnapshot = {
    mode: row.mode,
    maxPromptsPer24Hours: Number(row.max_prompts_per_24_hours) as 1 | 2 | 3,
    minimumRelevance: Number(row.minimum_relevance),
    pausedUntil,
    revision: Number(row.revision),
    updatedAt: updatedAt.toISOString(),
    persistence,
  };
  validateParsedSettings(settings);
  return settings;
}

function parseSettings(value: unknown): InitiativeSettingsSnapshot {
  if (!isRecord(value)) throw new Error('Stored initiative settings are invalid.');
  const pausedUntil = value['pausedUntil'];
  if (pausedUntil !== null && typeof pausedUntil !== 'string') {
    throw new Error('Stored initiative settings are invalid.');
  }
  const settings: InitiativeSettingsSnapshot = {
    mode: value['mode'] as InitiativeMode,
    maxPromptsPer24Hours: Number(value['maxPromptsPer24Hours']) as 1 | 2 | 3,
    minimumRelevance: Number(value['minimumRelevance']),
    pausedUntil,
    revision: Number(value['revision']),
    updatedAt: String(value['updatedAt']),
    persistence: value['persistence'] === 'postgres' ? 'postgres' : 'memory',
  };
  validateParsedSettings(settings);
  return settings;
}

function validateParsedSettings(settings: InitiativeSettingsSnapshot): void {
  if (
    !['reactive', 'balanced', 'proactive'].includes(settings.mode) ||
    ![1, 2, 3].includes(settings.maxPromptsPer24Hours) ||
    !Number.isFinite(settings.minimumRelevance) ||
    settings.minimumRelevance < 0.5 || settings.minimumRelevance > 0.95 ||
    !Number.isSafeInteger(settings.revision) || settings.revision < 1 ||
    Number.isNaN(new Date(settings.updatedAt).getTime()) ||
    (settings.pausedUntil !== null && Number.isNaN(new Date(settings.pausedUntil).getTime()))
  ) throw new Error('Stored initiative settings are invalid.');
}

function parseEvaluation(value: unknown): InitiativeEvaluation {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  if (
    !isRecord(parsed) || parsed['policyVersion'] !== initiativePolicyVersion ||
    typeof parsed['evaluationId'] !== 'string' || typeof parsed['requestId'] !== 'string' ||
    typeof parsed['contextHash'] !== 'string' || typeof parsed['createdAt'] !== 'string' ||
    !Number.isSafeInteger(parsed['settingsRevision']) ||
    (parsed['decision'] !== 'delivered' && parsed['decision'] !== 'suppressed') ||
    !initiativeReasons.includes(parsed['reason'] as InitiativeDecisionReason) ||
    (parsed['candidate'] !== null && !isRecord(parsed['candidate']))
  ) throw new Error('Stored initiative evaluation is invalid.');
  return parsed as InitiativeEvaluation;
}

const initiativeReasons: readonly InitiativeDecisionReason[] = [
  'delivered', 'reactive_mode', 'paused', 'rate_limited', 'below_relevance', 'no_material_signal',
];

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new InitiativeValidationError('Initiative request id is invalid.');
  }
}

function validateDate(value: Date): void {
  if (Number.isNaN(value.getTime())) throw new InitiativeValidationError('Initiative time is invalid.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = sha256(seed).slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function appendInitiativeAudit(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  event: Readonly<{
    eventType: string;
    resourceType: string;
    resourceId: string;
    decision: string;
    occurredAt: Date;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  const metadata = JSON.stringify(event.metadata);
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, 'strategy_reasoning', $6, $7::jsonb, $8)`,
    [
      context.tenantId,
      context.ownerUserId,
      event.eventType,
      event.resourceType,
      event.resourceId,
      event.decision,
      metadata,
      event.occurredAt,
    ],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [context.tenantId, event.resourceType, event.resourceId, event.eventType, metadata, event.occurredAt],
  );
}
