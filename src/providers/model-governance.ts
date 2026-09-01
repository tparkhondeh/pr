import { createHash } from 'node:crypto';
import type { TenantId, UserId } from '../kernel/identity.js';
import type {
  CostEvidence,
  WorkflowCostCharge,
  WorkflowCostControlService,
  WorkflowCostKind,
} from '../observability/workflow-cost-control.js';
import type {
  ModelGateway,
  ModelPurpose,
  ModelRequest,
  ModelResult,
  ModelUsage,
} from './model-gateway.js';
import {
  ModelInvocationConflictError,
  type ModelInvocationJournalService,
  type ModelInvocationJournalSnapshot,
  modelInvocationValueHash,
} from './model-invocation-journal.js';
import type {
  ModelInputSafetyResult,
  ModelInputSafetyService,
  ModelInputSafetySnapshot,
} from './model-input-safety.js';
import type {
  ModelInvocationReconciliationService,
  ModelInvocationReconciliationSnapshot,
} from './model-invocation-reconciliation.js';

export const modelGovernancePolicyVersion = 'prompt-model-governance-v1' as const;

export type ModelTier = 'economy' | 'balanced' | 'reasoning';
export type ModelRollout = 'disabled' | 'shadow' | 'canary' | 'active';
export type ModelEvalStatus = 'not_run' | 'failed' | 'passed';
export type ModelDataClass = 'public' | 'internal' | 'confidential' | 'restricted';

export type PromptModelRegistryEntry = Readonly<{
  id: string;
  purpose: ModelPurpose;
  schemaName: string;
  promptVersion: string;
  provider: string;
  model: string;
  modelTier: ModelTier;
  risk: 'low' | 'medium' | 'high';
  allowedDataClasses: readonly ModelDataClass[];
  maxOutputTokens: number;
  estimatedCostMinorUnits: number;
  plannedSteps: number;
  timeoutMs: number;
  rollout: ModelRollout;
  evalSuite: string;
  evalStatus: ModelEvalStatus;
}>;

export type ModelGovernanceSnapshot = Readonly<{
  policyVersion: typeof modelGovernancePolicyVersion;
  generatedAt: Date;
  providerConfigured: boolean;
  executionEnabled: boolean;
  costGateRequired: true;
  durableInvocationJournal: boolean;
  invocationJournal: ModelInvocationJournalSnapshot;
  reconciliation: ModelInvocationReconciliationSnapshot;
  inputSafety: ModelInputSafetySnapshot;
  routes: readonly PromptModelRegistryEntry[];
}>;

export class PromptModelRegistry {
  readonly #routes: readonly PromptModelRegistryEntry[];

  public constructor(routes: readonly PromptModelRegistryEntry[]) {
    const keys = new Set<string>();
    for (const route of routes) {
      validateRoute(route);
      const key = routeKey(route.purpose, route.schemaName);
      if (keys.has(key)) throw new ModelGovernanceValidationError(`Duplicate model route: ${key}`);
      keys.add(key);
    }
    this.#routes = [...routes];
  }

  public resolve(purpose: ModelPurpose, schemaName: string): PromptModelRegistryEntry | undefined {
    return this.#routes.find((entry) => entry.purpose === purpose && entry.schemaName === schemaName);
  }

  public list(): readonly PromptModelRegistryEntry[] {
    return [...this.#routes];
  }
}

export const defaultPromptModelRegistry = new PromptModelRegistry([
  defaultRoute('extract-evidence-v1', 'extract_evidence', 'evidence-extraction-v1', 'balanced', 'high'),
  defaultRoute('synthesize-hypothesis-v1', 'synthesize_hypothesis', 'hypothesis-synthesis-v1', 'reasoning', 'high'),
  defaultRoute('strategy-options-v1', 'strategy_options', 'strategic-options-v1', 'reasoning', 'high'),
  defaultRoute('draft-content-v1', 'draft_content', 'evidence-bound-draft-v1', 'balanced', 'high'),
  defaultRoute('evaluate-output-v1', 'evaluate_output', 'evaluation-v1', 'economy', 'medium'),
]);

export class ModelGovernanceService {
  public constructor(
    private readonly registry: PromptModelRegistry,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly providerConfigured: boolean,
    private readonly invocationJournal: ModelInvocationJournalService,
    private readonly inputSafety: ModelInputSafetyService,
    private readonly reconciliation: Pick<ModelInvocationReconciliationService, 'snapshot'>,
  ) {}

  public async snapshot(actorId: UserId, at: Date): Promise<ModelGovernanceSnapshot> {
    if (actorId !== this.identity.ownerUserId) {
      throw new ModelGovernancePermissionError('Only the owner may inspect model governance.');
    }
    const routes = this.registry.list();
    const invocationJournal = await this.invocationJournal.snapshot(actorId, at);
    const inputSafety = this.inputSafety.snapshot(at);
    return {
      policyVersion: modelGovernancePolicyVersion,
      generatedAt: at,
      providerConfigured: this.providerConfigured,
      executionEnabled: this.providerConfigured && invocationJournal.durable && routes.some((route) =>
        route.rollout === 'active' && route.evalStatus === 'passed'),
      costGateRequired: true,
      durableInvocationJournal: invocationJournal.durable,
      invocationJournal,
      reconciliation: this.reconciliation.snapshot(at, invocationJournal.summary.recoveryRequired),
      inputSafety,
      routes,
    };
  }
}

export type ProviderModelCommand<TInput> = Readonly<{
  requestId: string;
  promptVersion: string;
  purpose: ModelPurpose;
  schemaName: string;
  input: TInput;
  maxOutputTokens: number;
}>;

export type ProviderModelResult<TOutput> = Readonly<{
  output: TOutput;
  usage: ModelUsage;
  providerTraceId?: string;
}>;

export interface ExternalModelProvider {
  generateStructured<TInput, TOutput>(
    command: ProviderModelCommand<TInput>,
    signal: AbortSignal,
  ): Promise<ProviderModelResult<TOutput>>;
}

type SchemaValidator = (value: unknown) => boolean;

export class GovernedModelGateway implements ModelGateway {
  readonly #requests = new Map<string, Readonly<{ fingerprint: string; promise: Promise<ModelResult<unknown>> }>>();

  public constructor(
    private readonly registry: PromptModelRegistry,
    private readonly costs: Pick<WorkflowCostControlService, 'reserve' | 'charge'>,
    private readonly invocationJournal: Pick<ModelInvocationJournalService, 'begin' | 'complete' | 'persistence'>,
    private readonly inputSafety: Pick<ModelInputSafetyService, 'evaluate'>,
    private readonly provider: ExternalModelProvider,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly validators: ReadonlyMap<string, SchemaValidator>,
  ) {}

  public generateStructured<TInput, TOutput>(
    request: ModelRequest<TInput>,
  ): Promise<ModelResult<TOutput>> {
    let inputSafety: ModelInputSafetyResult;
    try {
      this.assertIdentity(request);
      inputSafety = this.inputSafety.evaluate(request.input, request.at);
    } catch (error) {
      if (error instanceof ModelGovernancePermissionError) return Promise.reject(error);
      return Promise.reject(new ModelGovernanceDeniedError('input_safety:scan_failed', { cause: error }));
    }
    if (inputSafety.disposition !== 'allow') {
      return Promise.reject(new ModelGovernanceDeniedError(
        `input_safety:${inputSafety.findings[0]?.code ?? 'denied'}`,
      ));
    }
    const fingerprint = requestFingerprint(request, inputSafety.scanSha256);
    const existing = this.#requests.get(request.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new ModelGovernanceConflictError('idempotency_mismatch'));
      }
      return existing.promise as Promise<ModelResult<TOutput>>;
    }
    const promise = this.execute<TInput, TOutput>(request, inputSafety);
    this.#requests.set(request.requestId, { fingerprint, promise });
    return promise;
  }

  private async execute<TInput, TOutput>(
    request: ModelRequest<TInput>,
    inputSafety: ModelInputSafetyResult,
  ): Promise<ModelResult<TOutput>> {
    const route = this.registry.resolve(request.purpose, request.schemaName);
    if (!route) throw new ModelGovernanceDeniedError('route_not_registered');
    if (route.rollout !== 'active') throw new ModelGovernanceDeniedError('route_not_active');
    if (route.evalStatus !== 'passed') throw new ModelGovernanceDeniedError('eval_not_passed');
    if (request.maxOutputTokens > route.maxOutputTokens) {
      throw new ModelGovernanceDeniedError('output_limit_exceeded');
    }
    if (request.dataClasses.some((dataClass) => !route.allowedDataClasses.includes(dataClass))) {
      throw new ModelGovernanceDeniedError('data_class_not_allowed');
    }
    if (request.dataClasses.some((dataClass) => dataClass !== 'public') && !request.externalProcessingApproved) {
      throw new ModelGovernanceDeniedError('external_processing_not_approved');
    }
    const validator = this.validators.get(route.schemaName);
    if (!validator) throw new ModelGovernanceDeniedError('schema_validator_missing');

    let journalBegin;
    try {
      journalBegin = await this.invocationJournal.begin(request.actorId, {
        requestId: request.requestId,
        workflowId: request.workflowId,
        invocationId: request.invocationId,
        purpose: request.purpose,
        schemaName: request.schemaName,
        registryEntryId: route.id,
        promptVersion: route.promptVersion,
        provider: route.provider,
        model: route.model,
        modelTier: route.modelTier,
        dataClasses: request.dataClasses,
        externalProcessingApproved: request.externalProcessingApproved,
        inputSafetyPolicyVersion: inputSafety.policyVersion,
        inputSha256: inputSafety.scanSha256,
        startedAt: request.at,
      });
    } catch (error) {
      if (error instanceof ModelInvocationConflictError) {
        throw new ModelGovernanceConflictError(
          error.reason === 'idempotency_mismatch' ? 'idempotency_mismatch' : 'invocation_already_recorded',
        );
      }
      throw error;
    }
    if (journalBegin.replay) {
      throw new ModelGovernanceConflictError('invocation_already_recorded');
    }

    const reservation = await this.costs.reserve(request.actorId, {
      requestId: costRequestId('reserve', request.requestId),
      workflowId: request.workflowId,
      invocationId: request.invocationId,
      kind: costKind(request.purpose),
      estimatedCostMinorUnits: route.estimatedCostMinorUnits,
      plannedSteps: route.plannedSteps,
      reservedAt: request.at,
    });
    if (reservation.decision !== 'allowed') {
      await this.invocationJournal.complete(request.actorId, {
        requestId: request.requestId,
        invocationRecordId: journalBegin.record.id,
        status: 'cost_blocked',
        statusReason: reservation.reason ?? 'cost_gate_blocked',
        reservationId: reservation.id,
        completedAt: request.at,
      });
      throw new ModelGovernanceDeniedError(`cost_gate:${reservation.reason ?? 'blocked'}`);
    }

    const controller = new AbortController();
    let providerResult: ProviderModelResult<TOutput>;
    try {
      providerResult = await withTimeout(
        this.provider.generateStructured<TInput, TOutput>({
          requestId: request.requestId,
          promptVersion: route.promptVersion,
          purpose: route.purpose,
          schemaName: route.schemaName,
          input: request.input,
          maxOutputTokens: request.maxOutputTokens,
        }, controller.signal),
        route.timeoutMs,
        controller,
      );
    } catch (error) {
      const charge = await this.settleUnmeteredFailure(request, route, reservation.id);
      const timedOut = error instanceof ModelProviderTimeoutError;
      await this.invocationJournal.complete(request.actorId, {
        requestId: request.requestId,
        invocationRecordId: journalBegin.record.id,
        status: timedOut ? 'timed_out' : 'provider_failed',
        statusReason: timedOut ? 'provider_timeout' : 'provider_failure',
        reservationId: reservation.id,
        chargeId: charge.id,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMinorUnits: 0,
        costEvidence: 'none',
        completedAt: request.at,
      });
      if (timedOut) throw error;
      throw new ModelProviderExecutionError('provider_failure', { cause: error });
    }

    try {
      validateUsage(providerResult.usage);
      if (providerResult.usage.provider !== route.provider || providerResult.usage.model !== route.model) {
        throw new ModelGovernanceValidationError('Provider usage metadata does not match the registry route.');
      }
    } catch (error) {
      const charge = await this.settleUnmeteredFailure(request, route, reservation.id);
      await this.invocationJournal.complete(request.actorId, {
        requestId: request.requestId,
        invocationRecordId: journalBegin.record.id,
        status: 'usage_invalid',
        statusReason: 'usage_metadata_invalid',
        reservationId: reservation.id,
        chargeId: charge.id,
        ...(providerResult.providerTraceId ? { providerTraceId: providerResult.providerTraceId } : {}),
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMinorUnits: 0,
        costEvidence: 'none',
        completedAt: request.at,
      });
      throw new ModelProviderExecutionError('provider_failure', { cause: error });
    }
    const charge = await this.costs.charge(request.actorId, {
      requestId: costRequestId('charge', request.requestId),
      reservationId: reservation.id,
      provider: route.provider,
      model: route.model,
      inputTokens: providerResult.usage.inputTokens,
      outputTokens: providerResult.usage.outputTokens,
      cachedInputTokens: providerResult.usage.cachedInputTokens,
      components: zeroComponents(providerResult.usage.costMinorUnits),
      actualSteps: route.plannedSteps,
      humanReviewSeconds: 0,
      costEvidence: providerResult.usage.costEvidence,
      chargedAt: request.at,
    });
    if (!validator(providerResult.output)) {
      await this.invocationJournal.complete(request.actorId, {
        requestId: request.requestId,
        invocationRecordId: journalBegin.record.id,
        status: 'output_invalid',
        statusReason: 'schema_validation_failed',
        reservationId: reservation.id,
        chargeId: charge.id,
        ...(providerResult.providerTraceId ? { providerTraceId: providerResult.providerTraceId } : {}),
        inputTokens: providerResult.usage.inputTokens,
        outputTokens: providerResult.usage.outputTokens,
        cachedInputTokens: providerResult.usage.cachedInputTokens,
        costMinorUnits: providerResult.usage.costMinorUnits,
        costEvidence: providerResult.usage.costEvidence,
        outputSha256: modelInvocationValueHash(providerResult.output),
        completedAt: request.at,
      });
      throw new ModelOutputValidationError(`Provider output does not match ${route.schemaName}.`);
    }
    await this.invocationJournal.complete(request.actorId, {
      requestId: request.requestId,
      invocationRecordId: journalBegin.record.id,
      status: 'succeeded',
      reservationId: reservation.id,
      chargeId: charge.id,
      ...(providerResult.providerTraceId ? { providerTraceId: providerResult.providerTraceId } : {}),
      inputTokens: providerResult.usage.inputTokens,
      outputTokens: providerResult.usage.outputTokens,
      cachedInputTokens: providerResult.usage.cachedInputTokens,
      costMinorUnits: providerResult.usage.costMinorUnits,
      costEvidence: providerResult.usage.costEvidence,
      outputSha256: modelInvocationValueHash(providerResult.output),
      completedAt: request.at,
    });
    return {
      requestId: request.requestId,
      output: providerResult.output,
      usage: providerResult.usage,
      ...(providerResult.providerTraceId ? { providerTraceId: providerResult.providerTraceId } : {}),
      governance: {
        policyVersion: modelGovernancePolicyVersion,
        registryEntryId: route.id,
        promptVersion: route.promptVersion,
        modelTier: route.modelTier,
        reservationId: reservation.id,
        chargeId: charge.id,
        invocationJournalId: journalBegin.record.id,
        invocationJournalPersistence: this.invocationJournal.persistence,
        inputSafetyPolicyVersion: inputSafety.policyVersion,
        inputSafetyScanSha256: inputSafety.scanSha256,
        circuitOpened: charge.circuitOpened,
      },
    };
  }

  private assertIdentity<TInput>(request: ModelRequest<TInput>): void {
    if (request.tenantId !== this.identity.tenantId || request.actorId !== this.identity.ownerUserId) {
      throw new ModelGovernancePermissionError('Model request identity does not match the owner context.');
    }
  }

  private async settleUnmeteredFailure<TInput>(
    request: ModelRequest<TInput>,
    route: PromptModelRegistryEntry,
    reservationId: string,
  ): Promise<WorkflowCostCharge> {
    return await this.costs.charge(request.actorId, {
      requestId: costRequestId('charge', request.requestId),
      reservationId,
      provider: route.provider,
      model: route.model,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      components: zeroComponents(0),
      actualSteps: route.plannedSteps,
      humanReviewSeconds: 0,
      costEvidence: 'none',
      chargedAt: request.at,
    });
  }
}

export class ModelGovernanceValidationError extends Error {}
export class ModelGovernancePermissionError extends Error {}
export class ModelGovernanceConflictError extends Error {
  public constructor(public readonly reason: 'idempotency_mismatch' | 'invocation_already_recorded') {
    super(`Model governance conflict: ${reason}`);
  }
}
export class ModelGovernanceDeniedError extends Error {
  public constructor(public readonly reason: string, options?: ErrorOptions) {
    super(reason, options);
  }
}
export class ModelProviderExecutionError extends Error {
  public constructor(public readonly reason: 'provider_failure', options?: ErrorOptions) {
    super(`Model provider execution failed: ${reason}`, options);
  }
}
export class ModelProviderTimeoutError extends Error {}
export class ModelOutputValidationError extends Error {}

function defaultRoute(
  id: string,
  purpose: ModelPurpose,
  schemaName: string,
  modelTier: ModelTier,
  risk: PromptModelRegistryEntry['risk'],
): PromptModelRegistryEntry {
  return {
    id,
    purpose,
    schemaName,
    promptVersion: `${id}.0`,
    provider: 'not-configured',
    model: 'not-configured',
    modelTier,
    risk,
    allowedDataClasses: ['public', 'internal'],
    maxOutputTokens: 4_000,
    estimatedCostMinorUnits: 25,
    plannedSteps: 1,
    timeoutMs: 30_000,
    rollout: 'disabled',
    evalSuite: `${id}-eval-v1`,
    evalStatus: 'not_run',
  };
}

function validateRoute(route: PromptModelRegistryEntry): void {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/u.test(route.id)) {
    throw new ModelGovernanceValidationError('Registry entry id is invalid.');
  }
  if (route.schemaName.trim().length === 0 || route.schemaName.length > 120) {
    throw new ModelGovernanceValidationError('Schema name is invalid.');
  }
  if (route.promptVersion.trim().length === 0 || route.promptVersion.length > 120) {
    throw new ModelGovernanceValidationError('Prompt version is invalid.');
  }
  if (route.allowedDataClasses.length === 0) {
    throw new ModelGovernanceValidationError('At least one data class must be allowed.');
  }
  validateInteger(route.maxOutputTokens, 'Max output tokens', 1, 1_000_000);
  validateInteger(route.estimatedCostMinorUnits, 'Estimated cost', 0, 1_000_000);
  validateInteger(route.plannedSteps, 'Planned steps', 1, 1_000);
  validateInteger(route.timeoutMs, 'Timeout', 1, 300_000);
}

function validateUsage(usage: ModelUsage): void {
  validateInteger(usage.inputTokens, 'Input tokens', 0, 1_000_000_000);
  validateInteger(usage.outputTokens, 'Output tokens', 0, 1_000_000_000);
  validateInteger(usage.cachedInputTokens, 'Cached input tokens', 0, 1_000_000_000);
  validateInteger(usage.costMinorUnits, 'Cost', 0, 1_000_000);
  if (usage.cachedInputTokens > usage.inputTokens) {
    throw new ModelGovernanceValidationError('Cached input tokens exceed input tokens.');
  }
  if (usage.costEvidence === 'none' && usage.costMinorUnits !== 0) {
    throw new ModelGovernanceValidationError('Unmetered provider usage cannot claim a monetary cost.');
  }
}

function validateInteger(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ModelGovernanceValidationError(`${label} is invalid.`);
  }
}

function routeKey(purpose: ModelPurpose, schemaName: string): string {
  return `${purpose}:${schemaName}`;
}

function costKind(purpose: ModelPurpose): WorkflowCostKind {
  if (purpose === 'strategy_options') return 'strategy_recommendation';
  if (purpose === 'draft_content') return 'draft_generation';
  if (purpose === 'evaluate_output') return 'evaluation';
  return 'other';
}

function costRequestId(kind: 'reserve' | 'charge', requestId: string): string {
  const digest = createHash('sha256').update(`${kind}:${requestId}`).digest('hex').slice(0, 40);
  return `mg_${kind === 'reserve' ? 'r' : 'c'}_${digest}`;
}

function zeroComponents(modelMinorUnits: number) {
  return {
    modelMinorUnits,
    embeddingMinorUnits: 0,
    storageMinorUnits: 0,
    searchMinorUnits: 0,
    toolApiMinorUnits: 0,
    computeMinorUnits: 0,
  };
}

function requestFingerprint<TInput>(request: ModelRequest<TInput>, inputScanSha256: string): string {
  return createHash('sha256').update(JSON.stringify({
    requestId: request.requestId,
    workflowId: request.workflowId,
    invocationId: request.invocationId,
    tenantId: request.tenantId,
    actorId: request.actorId,
    purpose: request.purpose,
    dataClasses: [...request.dataClasses].sort(),
    externalProcessingApproved: request.externalProcessingApproved,
    schemaName: request.schemaName,
    maxOutputTokens: request.maxOutputTokens,
    at: request.at.toISOString(),
    inputScanSha256,
  })).digest('hex');
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ModelProviderTimeoutError(`Model provider exceeded ${String(timeoutMs)}ms timeout.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function modelUsage(
  provider: string,
  model: string,
  costMinorUnits: number,
  costEvidence: CostEvidence,
  inputTokens = 0,
  outputTokens = 0,
  cachedInputTokens = 0,
): ModelUsage {
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costMinorUnits,
    costEvidence,
  };
}
