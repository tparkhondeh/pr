import { createHash } from 'node:crypto';
import type { TenantId, UserId } from '../kernel/identity.js';

export const workflowCostPolicyVersion = 'workflow-cost-budget-v1' as const;

export const workflowCostKinds = [
  'strategy_recommendation',
  'draft_generation',
  'research',
  'platform_adaptation',
  'evaluation',
  'other',
] as const;

export type WorkflowCostKind = (typeof workflowCostKinds)[number];
export type CostEvidence = 'provider_reported' | 'estimated' | 'none';
export type CostCircuitReason =
  | 'invocation_budget_exceeded'
  | 'workflow_budget_exceeded'
  | 'daily_budget_exceeded'
  | 'workflow_invocation_limit_exceeded'
  | 'workflow_step_limit_exceeded'
  | 'workflow_circuit_open'
  | 'actual_cost_exceeded_reservation'
  | 'actual_steps_exceeded_reservation';

export type WorkflowCostPolicy = Readonly<{
  version: typeof workflowCostPolicyVersion;
  currency: 'USD';
  perInvocationBudgetMinorUnits: number;
  perWorkflowBudgetMinorUnits: number;
  dailyBudgetMinorUnits: number;
  maxInvocationsPerWorkflow: number;
  maxStepsPerWorkflow: number;
  warningRatio: number;
}>;

export const defaultWorkflowCostPolicy: WorkflowCostPolicy = {
  version: workflowCostPolicyVersion,
  currency: 'USD',
  perInvocationBudgetMinorUnits: 100,
  perWorkflowBudgetMinorUnits: 500,
  dailyBudgetMinorUnits: 2_000,
  maxInvocationsPerWorkflow: 12,
  maxStepsPerWorkflow: 16,
  warningRatio: 0.8,
};

export type WorkflowCostReservationCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  workflowId: string;
  invocationId: string;
  kind: WorkflowCostKind;
  estimatedCostMinorUnits: number;
  plannedSteps: number;
  reservedAt: Date;
}>;

export type WorkflowCostReservation = Readonly<{
  id: string;
  requestId: string;
  workflowId: string;
  invocationId: string;
  kind: WorkflowCostKind;
  estimatedCostMinorUnits: number;
  plannedSteps: number;
  decision: 'allowed' | 'blocked';
  reason?: CostCircuitReason;
  reservedAt: Date;
}>;

export type WorkflowCostComponents = Readonly<{
  modelMinorUnits: number;
  embeddingMinorUnits: number;
  storageMinorUnits: number;
  searchMinorUnits: number;
  toolApiMinorUnits: number;
  computeMinorUnits: number;
}>;

export type WorkflowCostChargeCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  reservationId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  components: WorkflowCostComponents;
  actualSteps: number;
  humanReviewSeconds: number;
  costEvidence: CostEvidence;
  chargedAt: Date;
}>;

export type WorkflowCostCharge = Readonly<{
  id: string;
  requestId: string;
  reservationId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  components: WorkflowCostComponents;
  actualCostMinorUnits: number;
  actualSteps: number;
  humanReviewSeconds: number;
  costEvidence: CostEvidence;
  circuitOpened: boolean;
  circuitReason?: CostCircuitReason;
  chargedAt: Date;
}>;

export type WorkflowCostPersistence = 'memory' | 'postgres';

export type WorkflowCostSnapshot = Readonly<{
  policyVersion: typeof workflowCostPolicyVersion;
  generatedAt: Date;
  persistence: WorkflowCostPersistence;
  policy: WorkflowCostPolicy;
  truthStatus: 'no_usage' | 'measured' | 'estimated' | 'unmetered' | 'mixed';
  day: Readonly<{
    date: string;
    chargedCostMinorUnits: number;
    activeReservedCostMinorUnits: number;
    remainingCostMinorUnits: number;
    status: 'within_budget' | 'warning' | 'circuit_open';
  }>;
  usage: Readonly<{
    chargeCount: number;
    measuredChargeCount: number;
    estimatedChargeCount: number;
    unmeteredChargeCount: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    modelMinorUnits: number;
    embeddingMinorUnits: number;
    storageMinorUnits: number;
    searchMinorUnits: number;
    toolApiMinorUnits: number;
    computeMinorUnits: number;
    humanReviewSeconds: number;
  }>;
  workflows: readonly Readonly<{
    workflowId: string;
    kind: WorkflowCostKind;
    invocationCount: number;
    chargedCostMinorUnits: number;
    activeReservedCostMinorUnits: number;
    actualSteps: number;
    status: 'within_budget' | 'warning' | 'circuit_open';
    circuitReason?: CostCircuitReason;
  }>[];
  recentReservations: readonly WorkflowCostReservation[];
  recentCharges: readonly WorkflowCostCharge[];
}>;

export interface WorkflowCostRepository {
  readonly persistence: WorkflowCostPersistence;
  listReservations(dayStart: Date): Promise<readonly WorkflowCostReservation[]>;
  listCharges(dayStart: Date): Promise<readonly WorkflowCostCharge[]>;
  reserve(
    command: WorkflowCostReservationCommand,
    policy: WorkflowCostPolicy,
  ): Promise<WorkflowCostReservation>;
  charge(
    command: WorkflowCostChargeCommand,
    policy: WorkflowCostPolicy,
  ): Promise<WorkflowCostCharge>;
}

export class WorkflowCostValidationError extends Error {}
export class WorkflowCostPermissionError extends Error {}
export class WorkflowCostConflictError extends Error {
  public constructor(public readonly reason:
    | 'idempotency_mismatch'
    | 'invocation_already_reserved'
    | 'reservation_not_found'
    | 'reservation_blocked'
    | 'reservation_already_charged') {
    super(`Workflow cost conflict: ${reason}`);
  }
}

export class WorkflowCostControlService {
  public constructor(
    private readonly repository: WorkflowCostRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly policy: WorkflowCostPolicy = defaultWorkflowCostPolicy,
  ) {}

  public async snapshot(actorId: UserId, at: Date): Promise<WorkflowCostSnapshot> {
    this.assertOwner(actorId);
    const dayStart = utcDayStart(at);
    const [reservations, charges] = await Promise.all([
      this.repository.listReservations(dayStart),
      this.repository.listCharges(dayStart),
    ]);
    return makeSnapshot(at, this.repository.persistence, this.policy, reservations, charges);
  }

  public async reserve(
    actorId: UserId,
    input: Omit<WorkflowCostReservationCommand, 'tenantId' | 'actorId'>,
  ): Promise<WorkflowCostReservation> {
    this.assertOwner(actorId);
    validateReservation(input);
    return await this.repository.reserve({ ...input, tenantId: this.identity.tenantId, actorId }, this.policy);
  }

  public async charge(
    actorId: UserId,
    input: Omit<WorkflowCostChargeCommand, 'tenantId' | 'actorId'>,
  ): Promise<WorkflowCostCharge> {
    this.assertOwner(actorId);
    validateCharge(input);
    return await this.repository.charge({ ...input, tenantId: this.identity.tenantId, actorId }, this.policy);
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new WorkflowCostPermissionError('Only the owner may inspect or mutate cost controls.');
    }
  }
}

export class InMemoryWorkflowCostRepository implements WorkflowCostRepository {
  public readonly persistence = 'memory' as const;
  readonly #reservations: WorkflowCostReservation[] = [];
  readonly #charges: WorkflowCostCharge[] = [];
  readonly #reservationFingerprints = new Map<string, string>();
  readonly #chargeFingerprints = new Map<string, string>();

  public listReservations(dayStart: Date): Promise<readonly WorkflowCostReservation[]> {
    const dayEnd = nextUtcDay(dayStart);
    return Promise.resolve(this.#reservations.filter(
      (entry) => entry.reservedAt >= dayStart && entry.reservedAt < dayEnd,
    ));
  }

  public listCharges(dayStart: Date): Promise<readonly WorkflowCostCharge[]> {
    const dayEnd = nextUtcDay(dayStart);
    return Promise.resolve(this.#charges.filter(
      (entry) => entry.chargedAt >= dayStart && entry.chargedAt < dayEnd,
    ));
  }

  public reserve(
    command: WorkflowCostReservationCommand,
    policy: WorkflowCostPolicy,
  ): Promise<WorkflowCostReservation> {
    const fingerprint = reservationFingerprint(command);
    const existing = this.#reservations.find((entry) => entry.requestId === command.requestId);
    if (existing) {
      if (this.#reservationFingerprints.get(command.requestId) !== fingerprint) {
        throw new WorkflowCostConflictError('idempotency_mismatch');
      }
      return Promise.resolve(existing);
    }
    if (this.#reservations.some((entry) =>
      entry.workflowId === command.workflowId && entry.invocationId === command.invocationId)) {
      throw new WorkflowCostConflictError('invocation_already_reserved');
    }
    const dayStart = utcDayStart(command.reservedAt);
    const dayEnd = nextUtcDay(dayStart);
    const dayReservations = this.#reservations.filter(
      (entry) => entry.reservedAt >= dayStart && entry.reservedAt < dayEnd,
    );
    const dayCharges = this.#charges.filter(
      (entry) => entry.chargedAt >= dayStart && entry.chargedAt < dayEnd,
    );
    const reason = reservationBlockReason(command, policy, dayReservations, dayCharges);
    const reservation: WorkflowCostReservation = {
      id: deterministicUuid(`workflow-cost-reservation:${command.tenantId}:${command.actorId}:${command.requestId}`),
      requestId: command.requestId,
      workflowId: command.workflowId,
      invocationId: command.invocationId,
      kind: command.kind,
      estimatedCostMinorUnits: command.estimatedCostMinorUnits,
      plannedSteps: command.plannedSteps,
      decision: reason ? 'blocked' : 'allowed',
      ...(reason ? { reason } : {}),
      reservedAt: command.reservedAt,
    };
    this.#reservations.push(reservation);
    this.#reservationFingerprints.set(command.requestId, fingerprint);
    return Promise.resolve(reservation);
  }

  public charge(
    command: WorkflowCostChargeCommand,
    policy: WorkflowCostPolicy,
  ): Promise<WorkflowCostCharge> {
    const fingerprint = chargeFingerprint(command);
    const existing = this.#charges.find((entry) => entry.requestId === command.requestId);
    if (existing) {
      if (this.#chargeFingerprints.get(command.requestId) !== fingerprint) {
        throw new WorkflowCostConflictError('idempotency_mismatch');
      }
      return Promise.resolve(existing);
    }
    if (this.#charges.some((entry) => entry.reservationId === command.reservationId)) {
      throw new WorkflowCostConflictError('reservation_already_charged');
    }
    const reservation = this.#reservations.find((entry) => entry.id === command.reservationId);
    if (!reservation) throw new WorkflowCostConflictError('reservation_not_found');
    if (reservation.decision !== 'allowed') throw new WorkflowCostConflictError('reservation_blocked');
    if (command.chargedAt < reservation.reservedAt) {
      throw new WorkflowCostValidationError('Charge time cannot precede its reservation.');
    }
    const dayStart = utcDayStart(command.chargedAt);
    const dayEnd = nextUtcDay(dayStart);
    const dayReservations = this.#reservations.filter(
      (entry) => entry.reservedAt >= dayStart && entry.reservedAt < dayEnd,
    );
    const dayCharges = this.#charges.filter(
      (entry) => entry.chargedAt >= dayStart && entry.chargedAt < dayEnd,
    );
    const actualCostMinorUnits = componentTotal(command.components);
    const circuitReason = settlementCircuitReason(
      command,
      reservation,
      actualCostMinorUnits,
      policy,
      dayReservations,
      dayCharges,
    );
    const charge: WorkflowCostCharge = {
      id: deterministicUuid(`workflow-cost-charge:${command.tenantId}:${command.actorId}:${command.requestId}`),
      requestId: command.requestId,
      reservationId: command.reservationId,
      provider: command.provider,
      model: command.model,
      inputTokens: command.inputTokens,
      outputTokens: command.outputTokens,
      cachedInputTokens: command.cachedInputTokens,
      components: command.components,
      actualCostMinorUnits,
      actualSteps: command.actualSteps,
      humanReviewSeconds: command.humanReviewSeconds,
      costEvidence: command.costEvidence,
      circuitOpened: circuitReason !== undefined,
      ...(circuitReason ? { circuitReason } : {}),
      chargedAt: command.chargedAt,
    };
    this.#charges.push(charge);
    this.#chargeFingerprints.set(command.requestId, fingerprint);
    return Promise.resolve(charge);
  }
}

export function reservationFingerprint(command: WorkflowCostReservationCommand): string {
  return sha256({
    workflowId: command.workflowId,
    invocationId: command.invocationId,
    kind: command.kind,
    estimatedCostMinorUnits: command.estimatedCostMinorUnits,
    plannedSteps: command.plannedSteps,
  });
}

export function chargeFingerprint(command: WorkflowCostChargeCommand): string {
  return sha256({
    reservationId: command.reservationId,
    provider: command.provider,
    model: command.model,
    inputTokens: command.inputTokens,
    outputTokens: command.outputTokens,
    cachedInputTokens: command.cachedInputTokens,
    components: command.components,
    actualSteps: command.actualSteps,
    humanReviewSeconds: command.humanReviewSeconds,
    costEvidence: command.costEvidence,
  });
}

export function componentTotal(components: WorkflowCostComponents): number {
  return Object.values(components).reduce((total, value) => total + value, 0);
}

export function reservationBlockReason(
  command: Pick<WorkflowCostReservationCommand, 'workflowId' | 'estimatedCostMinorUnits' | 'plannedSteps'>,
  policy: WorkflowCostPolicy,
  reservations: readonly WorkflowCostReservation[],
  charges: readonly WorkflowCostCharge[],
): CostCircuitReason | undefined {
  if (command.estimatedCostMinorUnits > policy.perInvocationBudgetMinorUnits) {
    return 'invocation_budget_exceeded';
  }
  const workflowReservations = reservations.filter((entry) => entry.workflowId === command.workflowId);
  const reservationById = new Map(reservations.map((entry) => [entry.id, entry]));
  const workflowCharges = charges.filter(
    (charge) => reservationById.get(charge.reservationId)?.workflowId === command.workflowId,
  );
  const chargedReservationIds = new Set(charges.map((entry) => entry.reservationId));
  if (workflowCharges.some((entry) => entry.circuitOpened)) return 'workflow_circuit_open';
  const allowedReservations = workflowReservations.filter((entry) => entry.decision === 'allowed');
  if (allowedReservations.length >= policy.maxInvocationsPerWorkflow) {
    return 'workflow_invocation_limit_exceeded';
  }
  const workflowActualSteps = workflowCharges.reduce((total, entry) => total + entry.actualSteps, 0);
  const workflowReservedSteps = allowedReservations
    .filter((entry) => !chargedReservationIds.has(entry.id))
    .reduce((total, entry) => total + entry.plannedSteps, 0);
  if (workflowActualSteps + workflowReservedSteps + command.plannedSteps > policy.maxStepsPerWorkflow) {
    return 'workflow_step_limit_exceeded';
  }
  const workflowCharged = workflowCharges.reduce((total, entry) => total + entry.actualCostMinorUnits, 0);
  const workflowReserved = allowedReservations
    .filter((entry) => !chargedReservationIds.has(entry.id))
    .reduce((total, entry) => total + entry.estimatedCostMinorUnits, 0);
  if (workflowCharged + workflowReserved + command.estimatedCostMinorUnits > policy.perWorkflowBudgetMinorUnits) {
    return 'workflow_budget_exceeded';
  }
  const dayCharged = charges.reduce((total, entry) => total + entry.actualCostMinorUnits, 0);
  const dayReserved = reservations
    .filter((entry) => entry.decision === 'allowed' && !chargedReservationIds.has(entry.id))
    .reduce((total, entry) => total + entry.estimatedCostMinorUnits, 0);
  if (dayCharged + dayReserved + command.estimatedCostMinorUnits > policy.dailyBudgetMinorUnits) {
    return 'daily_budget_exceeded';
  }
  return undefined;
}

export function settlementCircuitReason(
  command: WorkflowCostChargeCommand,
  reservation: WorkflowCostReservation,
  actualCostMinorUnits: number,
  policy: WorkflowCostPolicy,
  reservations: readonly WorkflowCostReservation[],
  charges: readonly WorkflowCostCharge[],
): CostCircuitReason | undefined {
  if (actualCostMinorUnits > reservation.estimatedCostMinorUnits) {
    return 'actual_cost_exceeded_reservation';
  }
  if (command.actualSteps > reservation.plannedSteps) return 'actual_steps_exceeded_reservation';
  const workflowReservationIds = new Set(
    reservations
      .filter((entry) => entry.workflowId === reservation.workflowId)
      .map((entry) => entry.id),
  );
  const workflowCost = charges
    .filter((entry) => workflowReservationIds.has(entry.reservationId))
    .reduce((total, entry) => total + entry.actualCostMinorUnits, 0);
  if (workflowCost + actualCostMinorUnits > policy.perWorkflowBudgetMinorUnits) {
    return 'workflow_budget_exceeded';
  }
  if (charges.reduce((total, entry) => total + entry.actualCostMinorUnits, 0) + actualCostMinorUnits > policy.dailyBudgetMinorUnits) {
    return 'daily_budget_exceeded';
  }
  return undefined;
}

function makeSnapshot(
  at: Date,
  persistence: WorkflowCostPersistence,
  policy: WorkflowCostPolicy,
  reservations: readonly WorkflowCostReservation[],
  charges: readonly WorkflowCostCharge[],
): WorkflowCostSnapshot {
  const chargedReservationIds = new Set(charges.map((entry) => entry.reservationId));
  const activeReservations = reservations.filter(
    (entry) => entry.decision === 'allowed' && !chargedReservationIds.has(entry.id),
  );
  const charged = charges.reduce((total, entry) => total + entry.actualCostMinorUnits, 0);
  const reserved = activeReservations.reduce((total, entry) => total + entry.estimatedCostMinorUnits, 0);
  const circuitOpen = charges.some((entry) => entry.circuitOpened);
  const ratio = (charged + reserved) / policy.dailyBudgetMinorUnits;
  const grouped = new Map<string, WorkflowCostReservation[]>();
  for (const reservation of reservations) {
    grouped.set(reservation.workflowId, [...(grouped.get(reservation.workflowId) ?? []), reservation]);
  }
  const workflows = [...grouped.entries()].map(([workflowId, entries]) => {
    const ids = new Set(entries.map((entry) => entry.id));
    const workflowCharges = charges.filter((entry) => ids.has(entry.reservationId));
    const currentReservations = entries.filter(
      (entry) => entry.decision === 'allowed' && !chargedReservationIds.has(entry.id),
    );
    const workflowCharged = workflowCharges.reduce((total, entry) => total + entry.actualCostMinorUnits, 0);
    const workflowReserved = currentReservations.reduce((total, entry) => total + entry.estimatedCostMinorUnits, 0);
    const opened = workflowCharges.find((entry) => entry.circuitOpened);
    const workflowRatio = (workflowCharged + workflowReserved) / policy.perWorkflowBudgetMinorUnits;
    return {
      workflowId,
      kind: entries[0]?.kind ?? 'other',
      invocationCount: entries.filter((entry) => entry.decision === 'allowed').length,
      chargedCostMinorUnits: workflowCharged,
      activeReservedCostMinorUnits: workflowReserved,
      actualSteps: workflowCharges.reduce((total, entry) => total + entry.actualSteps, 0),
      status: opened ? 'circuit_open' as const : workflowRatio >= policy.warningRatio ? 'warning' as const : 'within_budget' as const,
      ...(opened?.circuitReason ? { circuitReason: opened.circuitReason } : {}),
    };
  });
  const evidenceKinds = new Set(charges.map((entry) => entry.costEvidence));
  const truthStatus = charges.length === 0
    ? 'no_usage' as const
    : evidenceKinds.size > 1
      ? 'mixed' as const
      : evidenceKinds.has('provider_reported')
        ? 'measured' as const
        : evidenceKinds.has('estimated')
          ? 'estimated' as const
          : 'unmetered' as const;
  const sum = (select: (entry: WorkflowCostCharge) => number): number =>
    charges.reduce((total, entry) => total + select(entry), 0);
  return {
    policyVersion: workflowCostPolicyVersion,
    generatedAt: at,
    persistence,
    policy,
    truthStatus,
    day: {
      date: at.toISOString().slice(0, 10),
      chargedCostMinorUnits: charged,
      activeReservedCostMinorUnits: reserved,
      remainingCostMinorUnits: Math.max(0, policy.dailyBudgetMinorUnits - charged - reserved),
      status: circuitOpen ? 'circuit_open' : ratio >= policy.warningRatio ? 'warning' : 'within_budget',
    },
    usage: {
      chargeCount: charges.length,
      measuredChargeCount: charges.filter((entry) => entry.costEvidence === 'provider_reported').length,
      estimatedChargeCount: charges.filter((entry) => entry.costEvidence === 'estimated').length,
      unmeteredChargeCount: charges.filter((entry) => entry.costEvidence === 'none').length,
      inputTokens: sum((entry) => entry.inputTokens),
      outputTokens: sum((entry) => entry.outputTokens),
      cachedInputTokens: sum((entry) => entry.cachedInputTokens),
      modelMinorUnits: sum((entry) => entry.components.modelMinorUnits),
      embeddingMinorUnits: sum((entry) => entry.components.embeddingMinorUnits),
      storageMinorUnits: sum((entry) => entry.components.storageMinorUnits),
      searchMinorUnits: sum((entry) => entry.components.searchMinorUnits),
      toolApiMinorUnits: sum((entry) => entry.components.toolApiMinorUnits),
      computeMinorUnits: sum((entry) => entry.components.computeMinorUnits),
      humanReviewSeconds: sum((entry) => entry.humanReviewSeconds),
    },
    workflows: workflows.sort((left, right) => right.chargedCostMinorUnits - left.chargedCostMinorUnits),
    recentReservations: [...reservations].sort((a, b) => b.reservedAt.getTime() - a.reservedAt.getTime()).slice(0, 50),
    recentCharges: [...charges].sort((a, b) => b.chargedAt.getTime() - a.chargedAt.getTime()).slice(0, 50),
  };
}

function validateReservation(input: Omit<WorkflowCostReservationCommand, 'tenantId' | 'actorId'>): void {
  validateRequestId(input.requestId);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,119}$/u.test(input.workflowId)) {
    throw new WorkflowCostValidationError('Workflow id is invalid.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,119}$/u.test(input.invocationId)) {
    throw new WorkflowCostValidationError('Invocation id is invalid.');
  }
  if (!workflowCostKinds.includes(input.kind)) throw new WorkflowCostValidationError('Workflow kind is invalid.');
  validateSafeCount(input.estimatedCostMinorUnits, 'Estimated cost', 1_000_000);
  validateSafeCount(input.plannedSteps, 'Planned steps', 1_000);
  validateDate(input.reservedAt, 'Reservation time');
}

function validateCharge(input: Omit<WorkflowCostChargeCommand, 'tenantId' | 'actorId'>): void {
  validateRequestId(input.requestId);
  if (!isUuid(input.reservationId)) throw new WorkflowCostValidationError('Reservation id is invalid.');
  if (input.provider.trim().length === 0 || input.provider.length > 120) throw new WorkflowCostValidationError('Provider is invalid.');
  if (input.model.trim().length === 0 || input.model.length > 120) throw new WorkflowCostValidationError('Model is invalid.');
  validateSafeCount(input.inputTokens, 'Input tokens', 1_000_000_000);
  validateSafeCount(input.outputTokens, 'Output tokens', 1_000_000_000);
  validateSafeCount(input.cachedInputTokens, 'Cached input tokens', 1_000_000_000);
  if (input.cachedInputTokens > input.inputTokens) throw new WorkflowCostValidationError('Cached input tokens exceed input tokens.');
  for (const [name, value] of Object.entries(input.components)) validateSafeCount(value, name, 1_000_000);
  validateSafeCount(input.actualSteps, 'Actual steps', 1_000);
  validateSafeCount(input.humanReviewSeconds, 'Human review seconds', 86_400);
  if (!['provider_reported', 'estimated', 'none'].includes(input.costEvidence)) throw new WorkflowCostValidationError('Cost evidence is invalid.');
  if (input.costEvidence === 'none' && componentTotal(input.components) !== 0) {
    throw new WorkflowCostValidationError('Unmetered cost must not invent a monetary value.');
  }
  validateDate(input.chargedAt, 'Charge time');
}

function validateSafeCount(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new WorkflowCostValidationError(`${label} is invalid.`);
  }
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) throw new WorkflowCostValidationError('Request id is invalid.');
}

function validateDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) throw new WorkflowCostValidationError(`${label} is invalid.`);
}

function utcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function nextUtcDay(dayStart: Date): Date {
  return new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000);
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
