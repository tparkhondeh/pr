import { createHash } from 'node:crypto';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { CostEvidence } from '../observability/workflow-cost-control.js';
import type { ModelDataClass, ModelTier } from './model-governance.js';
import type { ModelPurpose } from './model-gateway.js';
import { modelInputSafetyPolicyVersion } from './model-input-safety.js';

export const modelInvocationJournalPolicyVersion = 'model-invocation-journal-v1' as const;
export const modelInvocationReconciliationPolicyVersion = 'model-invocation-reconciliation-v1' as const;

export const modelInvocationTerminalStatuses = [
  'succeeded',
  'cost_blocked',
  'provider_failed',
  'timed_out',
  'usage_invalid',
  'output_invalid',
  'reconciled_not_executed',
  'reconciled_billed_output_unavailable',
] as const;

export type ModelInvocationTerminalStatus = (typeof modelInvocationTerminalStatuses)[number];
export type ModelInvocationStatus = 'started' | ModelInvocationTerminalStatus;
export type ModelInvocationPersistence = 'memory' | 'postgres';

export type ModelInvocationRecord = Readonly<{
  id: string;
  requestId: string;
  requestSha256: string;
  workflowId: string;
  invocationId: string;
  purpose: ModelPurpose;
  schemaName: string;
  registryEntryId: string;
  promptVersion: string;
  provider: string;
  model: string;
  modelTier: ModelTier;
  dataClasses: readonly ModelDataClass[];
  externalProcessingApproved: boolean;
  inputSafetyPolicyVersion?: typeof modelInputSafetyPolicyVersion;
  inputSha256: string;
  status: ModelInvocationStatus;
  statusReason?: string;
  reservationId?: string;
  chargeId?: string;
  providerTraceId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMinorUnits?: number;
  costEvidence?: CostEvidence;
  outputSha256?: string;
  reconciliationPolicyVersion?: typeof modelInvocationReconciliationPolicyVersion;
  reconciliationRequestId?: string;
  reconciliationEvidenceSha256?: string;
  startedAt: Date;
  completedAt?: Date;
}>;

export type BeginModelInvocationCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  workflowId: string;
  invocationId: string;
  purpose: ModelPurpose;
  schemaName: string;
  registryEntryId: string;
  promptVersion: string;
  provider: string;
  model: string;
  modelTier: ModelTier;
  dataClasses: readonly ModelDataClass[];
  externalProcessingApproved: boolean;
  inputSafetyPolicyVersion: typeof modelInputSafetyPolicyVersion;
  inputSha256: string;
  startedAt: Date;
}>;

export type CompleteModelInvocationCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  invocationRecordId: string;
  status: ModelInvocationTerminalStatus;
  statusReason?: string;
  reservationId?: string;
  chargeId?: string;
  providerTraceId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMinorUnits?: number;
  costEvidence?: CostEvidence;
  outputSha256?: string;
  reconciliationPolicyVersion?: typeof modelInvocationReconciliationPolicyVersion;
  reconciliationRequestId?: string;
  reconciliationEvidenceSha256?: string;
  completedAt: Date;
}>;

export type ModelInvocationBeginResult = Readonly<{
  record: ModelInvocationRecord;
  replay: boolean;
}>;

export type ModelInvocationSummary = Readonly<{
  total: number;
  started: number;
  recoveryRequired: number;
  succeeded: number;
  blocked: number;
  failed: number;
  reconciled: number;
}>;

export type ModelInvocationJournalSnapshot = Readonly<{
  policyVersion: typeof modelInvocationJournalPolicyVersion;
  generatedAt: Date;
  persistence: ModelInvocationPersistence;
  durable: boolean;
  summary: ModelInvocationSummary;
  recentInvocations: readonly ModelInvocationRecord[];
}>;

export interface ModelInvocationJournalRepository {
  readonly persistence: ModelInvocationPersistence;
  begin(command: BeginModelInvocationCommand): Promise<ModelInvocationBeginResult>;
  complete(command: CompleteModelInvocationCommand): Promise<ModelInvocationRecord>;
  get(id: string): Promise<ModelInvocationRecord | undefined>;
  summarize(): Promise<ModelInvocationSummary>;
  list(limit: number): Promise<readonly ModelInvocationRecord[]>;
}

export class ModelInvocationJournalService {
  public constructor(
    private readonly repository: ModelInvocationJournalRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public get persistence(): ModelInvocationPersistence {
    return this.repository.persistence;
  }

  public async begin(
    actorId: UserId,
    input: Omit<BeginModelInvocationCommand, 'tenantId' | 'actorId'>,
  ): Promise<ModelInvocationBeginResult> {
    this.assertOwner(actorId);
    validateBegin(input);
    return await this.repository.begin({ ...input, tenantId: this.identity.tenantId, actorId });
  }

  public async complete(
    actorId: UserId,
    input: Omit<CompleteModelInvocationCommand, 'tenantId' | 'actorId'>,
  ): Promise<ModelInvocationRecord> {
    this.assertOwner(actorId);
    validateCompletion(input);
    return await this.repository.complete({ ...input, tenantId: this.identity.tenantId, actorId });
  }

  public async get(actorId: UserId, id: string): Promise<ModelInvocationRecord | undefined> {
    this.assertOwner(actorId);
    if (!isUuid(id)) throw new ModelInvocationValidationError('Invocation record id is invalid.');
    return await this.repository.get(id);
  }

  public async snapshot(actorId: UserId, at: Date): Promise<ModelInvocationJournalSnapshot> {
    this.assertOwner(actorId);
    validateDate(at, 'Snapshot time');
    const [summary, records] = await Promise.all([
      this.repository.summarize(),
      this.repository.list(50),
    ]);
    return {
      policyVersion: modelInvocationJournalPolicyVersion,
      generatedAt: at,
      persistence: this.repository.persistence,
      durable: this.repository.persistence === 'postgres',
      summary,
      recentInvocations: records,
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new ModelInvocationPermissionError('Only the owner may use the model invocation journal.');
    }
  }
}

export class InMemoryModelInvocationJournalRepository implements ModelInvocationJournalRepository {
  public readonly persistence = 'memory' as const;
  readonly #records: ModelInvocationRecord[] = [];
  readonly #beginFingerprints = new Map<string, string>();
  readonly #completionFingerprints = new Map<string, string>();

  public get(id: string): Promise<ModelInvocationRecord | undefined> {
    return Promise.resolve(this.#records.find((record) => record.id === id));
  }

  public begin(command: BeginModelInvocationCommand): Promise<ModelInvocationBeginResult> {
    const fingerprint = modelInvocationBeginFingerprint(command);
    const existing = this.#records.find((record) => record.requestId === command.requestId);
    if (existing) {
      if (this.#beginFingerprints.get(command.requestId) !== fingerprint) {
        throw new ModelInvocationConflictError('idempotency_mismatch');
      }
      return Promise.resolve({ record: existing, replay: true });
    }
    if (this.#records.some((record) =>
      record.workflowId === command.workflowId && record.invocationId === command.invocationId)) {
      throw new ModelInvocationConflictError('invocation_already_recorded');
    }
    const record: ModelInvocationRecord = {
      id: deterministicUuid(
        `model-invocation:${command.tenantId}:${command.actorId}:${command.requestId}`,
      ),
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
    };
    this.#records.push(record);
    this.#beginFingerprints.set(command.requestId, fingerprint);
    return Promise.resolve({ record, replay: false });
  }

  public complete(command: CompleteModelInvocationCommand): Promise<ModelInvocationRecord> {
    const fingerprint = modelInvocationCompletionFingerprint(command);
    const index = this.#records.findIndex((record) => record.id === command.invocationRecordId);
    const existing = this.#records[index];
    if (!existing || existing.requestId !== command.requestId) {
      throw new ModelInvocationConflictError('invocation_not_found');
    }
    if (existing.status !== 'started') {
      if (this.#completionFingerprints.get(existing.id) !== fingerprint) {
        throw new ModelInvocationConflictError('completion_mismatch');
      }
      return Promise.resolve(existing);
    }
    if (command.completedAt < existing.startedAt) {
      throw new ModelInvocationValidationError('Completion time cannot precede start time.');
    }
    const completed = completeRecord(existing, command);
    this.#records[index] = completed;
    this.#completionFingerprints.set(existing.id, fingerprint);
    return Promise.resolve(completed);
  }

  public list(limit: number): Promise<readonly ModelInvocationRecord[]> {
    return Promise.resolve([...this.#records]
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .slice(0, limit));
  }

  public summarize(): Promise<ModelInvocationSummary> {
    const started = this.#records.filter((record) => record.status === 'started').length;
    return Promise.resolve({
      total: this.#records.length,
      started,
      recoveryRequired: started,
      succeeded: this.#records.filter((record) => record.status === 'succeeded').length,
      blocked: this.#records.filter((record) => record.status === 'cost_blocked').length,
      failed: this.#records.filter((record) =>
        [
          'provider_failed', 'timed_out', 'usage_invalid', 'output_invalid',
          'reconciled_billed_output_unavailable',
        ].includes(record.status)).length,
      reconciled: this.#records.filter((record) =>
        ['reconciled_not_executed', 'reconciled_billed_output_unavailable'].includes(record.status)).length,
    });
  }
}

export class ModelInvocationValidationError extends Error {}
export class ModelInvocationPermissionError extends Error {}
export class ModelInvocationConflictError extends Error {
  public constructor(public readonly reason:
    | 'idempotency_mismatch'
    | 'invocation_already_recorded'
    | 'invocation_not_found'
    | 'completion_mismatch') {
    super(`Model invocation conflict: ${reason}`);
  }
}

export function modelInvocationValueHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function modelInvocationBeginFingerprint(command: BeginModelInvocationCommand): string {
  return sha256(canonicalJson({
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
  }));
}

export function modelInvocationCompletionFingerprint(command: CompleteModelInvocationCommand): string {
  return sha256(canonicalJson({
    invocationRecordId: command.invocationRecordId,
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
    reconciliationPolicyVersion: command.reconciliationPolicyVersion ?? null,
    reconciliationRequestId: command.reconciliationRequestId ?? null,
    reconciliationEvidenceSha256: command.reconciliationEvidenceSha256 ?? null,
  }));
}

function completeRecord(
  existing: ModelInvocationRecord,
  command: CompleteModelInvocationCommand,
): ModelInvocationRecord {
  return {
    ...existing,
    status: command.status,
    ...(command.statusReason ? { statusReason: command.statusReason } : {}),
    ...(command.reservationId ? { reservationId: command.reservationId } : {}),
    ...(command.chargeId ? { chargeId: command.chargeId } : {}),
    ...(command.providerTraceId ? { providerTraceId: command.providerTraceId } : {}),
    ...(command.inputTokens !== undefined ? { inputTokens: command.inputTokens } : {}),
    ...(command.outputTokens !== undefined ? { outputTokens: command.outputTokens } : {}),
    ...(command.cachedInputTokens !== undefined ? { cachedInputTokens: command.cachedInputTokens } : {}),
    ...(command.costMinorUnits !== undefined ? { costMinorUnits: command.costMinorUnits } : {}),
    ...(command.costEvidence ? { costEvidence: command.costEvidence } : {}),
    ...(command.outputSha256 ? { outputSha256: command.outputSha256 } : {}),
    ...(command.reconciliationPolicyVersion
      ? { reconciliationPolicyVersion: command.reconciliationPolicyVersion }
      : {}),
    ...(command.reconciliationRequestId ? { reconciliationRequestId: command.reconciliationRequestId } : {}),
    ...(command.reconciliationEvidenceSha256
      ? { reconciliationEvidenceSha256: command.reconciliationEvidenceSha256 }
      : {}),
    completedAt: command.completedAt,
  };
}

function validateBegin(input: Omit<BeginModelInvocationCommand, 'tenantId' | 'actorId'>): void {
  validateRequestId(input.requestId);
  validateScopedId(input.workflowId, 'Workflow id');
  validateScopedId(input.invocationId, 'Invocation id');
  validateLabel(input.schemaName, 'Schema name');
  validateLabel(input.registryEntryId, 'Registry entry id');
  validateLabel(input.promptVersion, 'Prompt version');
  validateLabel(input.provider, 'Provider');
  validateLabel(input.model, 'Model');
  if (input.dataClasses.length === 0 || input.dataClasses.some((value) =>
    !['public', 'internal', 'confidential', 'restricted'].includes(value))) {
    throw new ModelInvocationValidationError('Data classes are invalid.');
  }
  const inputSafetyPolicyVersion: unknown = input.inputSafetyPolicyVersion;
  if (inputSafetyPolicyVersion !== modelInputSafetyPolicyVersion) {
    throw new ModelInvocationValidationError('Input safety policy version is invalid.');
  }
  validateSha256(input.inputSha256, 'Input hash');
  validateDate(input.startedAt, 'Start time');
}

function validateCompletion(
  input: Omit<CompleteModelInvocationCommand, 'tenantId' | 'actorId'>,
): void {
  validateRequestId(input.requestId);
  if (!isUuid(input.invocationRecordId)) {
    throw new ModelInvocationValidationError('Invocation record id is invalid.');
  }
  if (!modelInvocationTerminalStatuses.includes(input.status)) {
    throw new ModelInvocationValidationError('Invocation status is invalid.');
  }
  if (input.statusReason !== undefined) validateLabel(input.statusReason, 'Status reason', 200);
  if (input.reservationId !== undefined && !isUuid(input.reservationId)) {
    throw new ModelInvocationValidationError('Reservation id is invalid.');
  }
  if (input.chargeId !== undefined && !isUuid(input.chargeId)) {
    throw new ModelInvocationValidationError('Charge id is invalid.');
  }
  if (input.providerTraceId !== undefined) validateLabel(input.providerTraceId, 'Provider trace id', 200);
  for (const [label, value] of [
    ['Input tokens', input.inputTokens],
    ['Output tokens', input.outputTokens],
    ['Cached input tokens', input.cachedInputTokens],
    ['Cost', input.costMinorUnits],
  ] as const) {
    if (value !== undefined) validateInteger(value, label, 1_000_000_000);
  }
  if (
    input.cachedInputTokens !== undefined && input.inputTokens !== undefined &&
    input.cachedInputTokens > input.inputTokens
  ) throw new ModelInvocationValidationError('Cached input tokens exceed input tokens.');
  if (input.costEvidence === 'none' && input.costMinorUnits !== 0) {
    throw new ModelInvocationValidationError('Unmetered invocation must not invent cost.');
  }
  if (
    input.costEvidence !== undefined &&
    !['provider_reported', 'estimated', 'none'].includes(input.costEvidence)
  ) {
    throw new ModelInvocationValidationError('Cost evidence is invalid.');
  }
  if (input.outputSha256 !== undefined) validateSha256(input.outputSha256, 'Output hash');
  const isReconciliation = input.status === 'reconciled_not_executed' ||
    input.status === 'reconciled_billed_output_unavailable';
  if (isReconciliation) {
    if (input.reconciliationPolicyVersion !== modelInvocationReconciliationPolicyVersion) {
      throw new ModelInvocationValidationError('Reconciliation policy version is invalid.');
    }
    if (!input.reconciliationRequestId) {
      throw new ModelInvocationValidationError('Reconciliation request id is required.');
    }
    validateRequestId(input.reconciliationRequestId);
    if (!input.reconciliationEvidenceSha256) {
      throw new ModelInvocationValidationError('Reconciliation evidence hash is required.');
    }
    validateSha256(input.reconciliationEvidenceSha256, 'Reconciliation evidence hash');
  } else if (
    input.reconciliationPolicyVersion !== undefined ||
    input.reconciliationRequestId !== undefined ||
    input.reconciliationEvidenceSha256 !== undefined
  ) {
    throw new ModelInvocationValidationError('Non-reconciliation status cannot claim reconciliation evidence.');
  }
  if (input.status === 'cost_blocked') {
    if (!input.reservationId) {
      throw new ModelInvocationValidationError('Cost-blocked invocation requires a reservation id.');
    }
    if (
      input.chargeId !== undefined || input.providerTraceId !== undefined ||
      input.inputTokens !== undefined || input.outputTokens !== undefined ||
      input.cachedInputTokens !== undefined || input.costMinorUnits !== undefined ||
      input.costEvidence !== undefined || input.outputSha256 !== undefined
    ) {
      throw new ModelInvocationValidationError('Cost-blocked invocation cannot claim provider usage.');
    }
  } else if (input.status === 'reconciled_not_executed') {
    if (input.providerTraceId !== undefined || input.outputSha256 !== undefined) {
      throw new ModelInvocationValidationError('Not-executed reconciliation cannot claim provider output.');
    }
    if (input.chargeId) {
      if (
        !input.reservationId || input.inputTokens !== 0 || input.outputTokens !== 0 ||
        input.cachedInputTokens !== 0 || input.costMinorUnits !== 0 || input.costEvidence !== 'none'
      ) {
        throw new ModelInvocationValidationError('Settled not-executed reconciliation must be zero and unmetered.');
      }
    } else if (
      input.inputTokens !== undefined || input.outputTokens !== undefined ||
      input.cachedInputTokens !== undefined || input.costMinorUnits !== undefined ||
      input.costEvidence !== undefined
    ) {
      throw new ModelInvocationValidationError('Uncharged not-executed reconciliation cannot claim usage.');
    }
  } else if (input.status === 'reconciled_billed_output_unavailable') {
    if (
      !input.reservationId || !input.chargeId || !input.providerTraceId ||
      input.inputTokens === undefined || input.outputTokens === undefined ||
      input.cachedInputTokens === undefined || input.costMinorUnits === undefined ||
      input.costEvidence !== 'provider_reported' || input.outputSha256 !== undefined
    ) {
      throw new ModelInvocationValidationError(
        'Billed reconciliation requires provider-reported usage without a recoverable output.',
      );
    }
  } else {
    if (
      !input.reservationId || !input.chargeId ||
      input.inputTokens === undefined || input.outputTokens === undefined ||
      input.cachedInputTokens === undefined || input.costMinorUnits === undefined ||
      input.costEvidence === undefined
    ) {
      throw new ModelInvocationValidationError('Executed invocation requires charge and usage evidence.');
    }
    if (
      (input.status === 'succeeded' || input.status === 'output_invalid') &&
      input.outputSha256 === undefined
    ) {
      throw new ModelInvocationValidationError('Completed model output requires an output hash.');
    }
  }
  validateDate(input.completedAt, 'Completion time');
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ModelInvocationValidationError('Request id is invalid.');
  }
}

function validateScopedId(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,119}$/u.test(value)) {
    throw new ModelInvocationValidationError(`${label} is invalid.`);
  }
}

function validateLabel(value: string, label: string, maximum = 120): void {
  let containsControlCharacter = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) {
      containsControlCharacter = true;
      break;
    }
  }
  if (value.trim().length === 0 || value.length > maximum || containsControlCharacter) {
    throw new ModelInvocationValidationError(`${label} is invalid.`);
  }
}

function validateInteger(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new ModelInvocationValidationError(`${label} is invalid.`);
  }
}

function validateSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new ModelInvocationValidationError(`${label} is invalid.`);
}

function validateDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) throw new ModelInvocationValidationError(`${label} is invalid.`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
