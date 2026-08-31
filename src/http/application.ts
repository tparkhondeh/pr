import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DraftBlockedError,
  DraftConflictError,
  DraftNotFoundError,
  DraftPermissionError,
  DraftValidationError,
  draftChannels,
  type ContentDraftService,
  type DraftChannel,
  type DraftWorkspaceSnapshot,
} from '../claims/workspace.js';
import {
  ConversationValidationError,
  MemoryProposalConflictError,
  MemoryProposalNotFoundError,
  MemoryProposalPermissionError,
} from '../conversation/intake.js';
import type { ConversationIntakeService } from '../conversation/intake.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import {
  StrategyContextConflictError,
  StrategyContextPermissionError,
  StrategyContextValidationError,
  type EditableStrategyContext,
  type StrategyContextService,
  type StrategyContextSnapshot,
} from '../strategy/context.js';
import {
  WorkbenchActionNotFoundError,
  WorkbenchApprovalConflictError,
  type WorkbenchService,
} from '../workbench/workbench.js';

export type ReadinessCheck = () =>
  | Promise<Readonly<{ ready: boolean; reason?: string }>>
  | Readonly<{ ready: boolean; reason?: string }>;

export type ApplicationDependencies = Readonly<{
  workbench?: Pick<WorkbenchService, 'snapshot' | 'approve'>;
  strategy?: Pick<StrategyContextService, 'snapshot' | 'save'>;
  drafts?: Pick<ContentDraftService, 'snapshot' | 'create' | 'edit' | 'approve' | 'export'>;
  resolveActor?: (request: IncomingMessage) => UserId | undefined;
  tenantId?: TenantId;
  conversation?: Pick<
    ConversationIntakeService,
    'submitTurn' | 'confirmMemory' | 'applyMemoryRight' | 'memorySnapshot'
  >;
  clock?: () => Date;
}>;

export function createRequestHandler(
  readinessCheck: ReadinessCheck,
  dependencies: ApplicationDependencies = {},
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const path = request.url ? new URL(request.url, 'http://localhost').pathname : '/';

    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { status: 'alive' });
      return;
    }

    if (request.method === 'GET' && path === '/ready') {
      try {
        const readiness = await readinessCheck();
        sendJson(response, readiness.ready ? 200 : 503, {
          status: readiness.ready ? 'ready' : 'not_ready',
          ...(readiness.reason ? { reason: readiness.reason } : {}),
        });
      } catch {
        sendJson(response, 503, {
          status: 'not_ready',
          reason: 'readiness_check_failed',
        });
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/workbench') {
      if (!dependencies.workbench) {
        sendJson(response, 503, { error: 'workbench_unavailable' });
        return;
      }
      sendJson(response, 200, await dependencies.workbench.snapshot());
      return;
    }

    if (request.method === 'GET' && path === '/api/strategy') {
      await handleStrategySnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'PUT' && path === '/api/strategy') {
      await handleStrategySave(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/drafts/current') {
      await handleDraftSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/drafts') {
      await handleDraftCreate(request, response, dependencies);
      return;
    }

    const draftEdit = path.match(/^\/api\/drafts\/([0-9a-f-]{36})$/iu);
    if (request.method === 'PUT' && draftEdit?.[1]) {
      await handleDraftEdit(request, response, dependencies, draftEdit[1]);
      return;
    }

    const draftTransition = path.match(
      /^\/api\/drafts\/([0-9a-f-]{36})\/(approve|export)$/iu,
    );
    if (request.method === 'POST' && draftTransition?.[1] && draftTransition[2]) {
      await handleDraftTransition(
        request,
        response,
        dependencies,
        draftTransition[1],
        draftTransition[2] as 'approve' | 'export',
      );
      return;
    }

    if (request.method === 'POST' && path === '/api/workbench/approval') {
      await handleApproval(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/conversations/turns') {
      await handleConversationTurn(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/memory') {
      await handleMemorySnapshot(request, response, dependencies);
      return;
    }

    const proposalConfirmation = path.match(
      /^\/api\/memory\/proposals\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})\/confirm$/u,
    );
    if (request.method === 'POST' && proposalConfirmation?.[1]) {
      await handleMemoryConfirmation(
        request,
        response,
        dependencies,
        proposalConfirmation[1],
      );
      return;
    }

    const memoryRight = path.match(
      /^\/api\/memory\/proposals\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})\/rights$/u,
    );
    if (request.method === 'POST' && memoryRight?.[1]) {
      await handleMemoryRight(request, response, dependencies, memoryRight[1]);
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
  };
}

async function handleDraftSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.drafts?.snapshot(
      actorId,
      (dependencies.clock ?? (() => new Date()))(),
    );
    sendJson(response, 200, snapshot ? serializeDraft(snapshot) : null);
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftCreate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const sourceProposalId = body['sourceProposalId'];
    const channel = body['channel'];
    const narrativeAngle = body['narrativeAngle'];
    const takeaway = body['takeaway'];
    const publicDraftingConsent = body['publicDraftingConsent'];
    if (
      typeof requestId !== 'string' || typeof sourceProposalId !== 'string' ||
      !isDraftChannel(channel) || typeof narrativeAngle !== 'string' ||
      typeof takeaway !== 'string' || typeof publicDraftingConsent !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_draft_input' });
      return;
    }
    const result = await dependencies.drafts?.create({
      actorId,
      requestId,
      sourceProposalId,
      channel,
      narrativeAngle,
      takeaway,
      publicDraftingConsent,
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    });
    if (!result) throw new Error('Draft service disappeared.');
    sendJson(response, 200, { outcome: result.outcome, ...serializeDraft(result.snapshot) });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftEdit(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  draftId: string,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    const draftBody = body['body'];
    if (typeof requestId !== 'string' || typeof expectedRevision !== 'number' || typeof draftBody !== 'string') {
      sendJson(response, 400, { error: 'invalid_draft_input' });
      return;
    }
    const result = await dependencies.drafts?.edit({
      actorId,
      requestId,
      draftId,
      expectedRevision,
      body: draftBody,
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    });
    if (!result) throw new Error('Draft service disappeared.');
    sendJson(response, 200, { outcome: result.outcome, ...serializeDraft(result.snapshot) });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftTransition(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  draftId: string,
  operation: 'approve' | 'export',
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    if (typeof requestId !== 'string' || typeof expectedRevision !== 'number') {
      sendJson(response, 400, { error: 'invalid_draft_input' });
      return;
    }
    const command = {
      actorId,
      requestId,
      draftId,
      expectedRevision,
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    };
    if (operation === 'approve') {
      const result = await dependencies.drafts?.approve(command);
      if (!result) throw new Error('Draft service disappeared.');
      sendJson(response, 200, { outcome: result.outcome, ...serializeDraft(result.snapshot) });
      return;
    }
    const result = await dependencies.drafts?.export(command);
    if (!result) throw new Error('Draft service disappeared.');
    sendJson(response, 200, {
      outcome: result.outcome,
      filename: result.filename,
      mimeType: result.mimeType,
      content: result.content,
      draft: serializeDraft(result.snapshot),
    });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

function draftActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.drafts) {
    sendJson(response, 503, { error: 'drafts_unavailable' });
    return undefined;
  }
  return actorId;
}

function isDraftChannel(value: unknown): value is DraftChannel {
  return typeof value === 'string' && draftChannels.includes(value as DraftChannel);
}

function serializeDraft(snapshot: DraftWorkspaceSnapshot): Record<string, unknown> {
  return {
    draftId: snapshot.draftId,
    claimId: snapshot.claimId,
    revision: snapshot.revision,
    strategyRevision: snapshot.strategyRevision,
    channel: snapshot.channel,
    body: snapshot.body,
    status: snapshot.status,
    guard: snapshot.guard,
    source: snapshot.source,
    publicDraftingConsent: snapshot.publicDraftingConsent,
    sourceAvailable: snapshot.sourceAvailable,
    staleStrategy: snapshot.staleStrategy,
    ...(snapshot.approvedAt ? { approvedAt: snapshot.approvedAt.toISOString() } : {}),
    ...(snapshot.exportedAt ? { exportedAt: snapshot.exportedAt.toISOString() } : {}),
    updatedAt: snapshot.updatedAt.toISOString(),
    persistence: snapshot.persistence,
  };
}

function sendDraftError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof DraftValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_draft_input',
    });
    return;
  }
  if (error instanceof DraftPermissionError) {
    sendJson(response, 403, { error: 'draft_permission_denied' });
    return;
  }
  if (error instanceof DraftNotFoundError) {
    sendJson(response, 404, { error: 'draft_not_found' });
    return;
  }
  if (error instanceof DraftConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  if (error instanceof DraftBlockedError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'draft_failed' });
}

async function handleStrategySnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.strategy) {
    sendJson(response, 503, { error: 'strategy_unavailable' });
    return;
  }
  try {
    sendJson(response, 200, serializeStrategy(await dependencies.strategy.snapshot(actorId)));
  } catch (error: unknown) {
    sendStrategyError(response, error);
  }
}

async function handleStrategySave(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.strategy) {
    sendJson(response, 503, { error: 'strategy_unavailable' });
    return;
  }
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    const value = parseEditableStrategy(body['value']);
    if (typeof requestId !== 'string' || typeof expectedRevision !== 'number' || !value) {
      sendJson(response, 400, { error: 'invalid_strategy_context' });
      return;
    }
    const result = await dependencies.strategy.save({
      actorId,
      requestId,
      expectedRevision,
      value,
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    });
    sendJson(response, 200, { outcome: result.outcome, ...serializeStrategy(result.snapshot) });
  } catch (error: unknown) {
    sendStrategyError(response, error);
  }
}

function parseEditableStrategy(value: unknown): EditableStrategyContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const goalValue = record['goal'];
  const positioningValue = record['desiredPositioning'];
  if (!goalValue || typeof goalValue !== 'object' || Array.isArray(goalValue)) return null;
  if (!positioningValue || typeof positioningValue !== 'object' || Array.isArray(positioningValue)) return null;
  const goal = goalValue as Record<string, unknown>;
  const positioning = positioningValue as Record<string, unknown>;
  if (
    typeof goal['title'] !== 'string' ||
    typeof goal['outcome'] !== 'string' ||
    typeof goal['priority'] !== 'number' ||
    ![1, 2, 3, 4, 5].includes(goal['priority']) ||
    !isStringArray(goal['successMetrics']) ||
    typeof goal['horizon'] !== 'string' ||
    typeof positioning['audience'] !== 'string' ||
    typeof positioning['desiredPerception'] !== 'string' ||
    typeof positioning['differentiation'] !== 'string' ||
    !isStringArray(positioning['proofPoints']) ||
    typeof positioning['horizon'] !== 'string'
  ) return null;
  return {
    goal: {
      title: goal['title'],
      outcome: goal['outcome'],
      priority: goal['priority'] as 1 | 2 | 3 | 4 | 5,
      successMetrics: goal['successMetrics'],
      horizon: goal['horizon'],
    },
    desiredPositioning: {
      audience: positioning['audience'],
      desiredPerception: positioning['desiredPerception'],
      differentiation: positioning['differentiation'],
      proofPoints: positioning['proofPoints'],
      horizon: positioning['horizon'],
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function serializeStrategy(snapshot: StrategyContextSnapshot): Record<string, unknown> {
  return {
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt.toISOString(),
    persistence: snapshot.persistence,
    goalId: snapshot.goalId,
    positioningId: snapshot.positioningId,
    goal: snapshot.goal,
    desiredPositioning: snapshot.desiredPositioning,
  };
}

function sendStrategyError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof StrategyContextValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_strategy_context',
    });
    return;
  }
  if (error instanceof StrategyContextPermissionError) {
    sendJson(response, 403, { error: 'strategy_permission_denied' });
    return;
  }
  if (error instanceof StrategyContextConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'strategy_failed' });
}

async function handleMemorySnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }
  try {
    const snapshot = await dependencies.conversation.memorySnapshot({
      tenantId: dependencies.tenantId,
      actorId,
      generatedAt: (dependencies.clock ?? (() => new Date()))(),
    });
    sendJson(response, 200, {
      generatedAt: snapshot.generatedAt.toISOString(),
      persistence: snapshot.persistence,
      summary: snapshot.summary,
      records: snapshot.records.map((record) => ({
        proposalId: record.proposalId,
        assertionId: record.assertionId,
        text: record.text,
        epistemicType: record.epistemicType,
        dataClass: record.dataClass,
        confidence: record.confidence,
        confidenceRationale: record.confidenceRationale,
        provenance: record.provenance,
        consent: record.consent,
        lifecycle: {
          status: record.lifecycle.status,
          revisionCount: record.lifecycle.revisionCount,
          confirmedAt: record.lifecycle.confirmedAt.toISOString(),
          updatedAt: record.lifecycle.updatedAt.toISOString(),
          ...(record.lifecycle.contestedAt
            ? { contestedAt: record.lifecycle.contestedAt.toISOString() }
            : {}),
          ...(record.lifecycle.contestReason
            ? { contestReason: record.lifecycle.contestReason }
            : {}),
          ...(record.lifecycle.revokedAt
            ? { revokedAt: record.lifecycle.revokedAt.toISOString() }
            : {}),
          ...(record.lifecycle.deletedAt
            ? { deletedAt: record.lifecycle.deletedAt.toISOString() }
            : {}),
          ...(record.lifecycle.deletionReason
            ? { deletionReason: record.lifecycle.deletionReason }
            : {}),
        },
      })),
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

async function handleMemoryRight(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  proposalId: string,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const operation = body['operation'];
    const reason = body['reason'];
    const correctedText = body['correctedText'];
    if (
      typeof requestId !== 'string' ||
      !isMemoryRightKind(operation) ||
      typeof reason !== 'string' ||
      (operation === 'correct' && typeof correctedText !== 'string')
    ) {
      sendJson(response, 400, { error: 'invalid_memory_right' });
      return;
    }
    const applied = await dependencies.conversation.applyMemoryRight({
      tenantId: dependencies.tenantId,
      actorId,
      proposalId,
      requestId,
      operation: operation === 'correct'
        ? {
            kind: operation,
            reason,
            correctedText: typeof correctedText === 'string' ? correctedText : '',
          }
        : { kind: operation, reason },
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    });
    sendJson(response, 200, {
      outcome: applied.outcome,
      operation: applied.operation,
      proposalId: applied.proposalId,
      requestId: applied.requestId,
      ...(applied.activeAssertionId
        ? { activeAssertionId: applied.activeAssertionId }
        : {}),
      permissionsRevoked: applied.permissionsRevoked,
      occurredAt: applied.occurredAt.toISOString(),
      persistence: applied.persistence,
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

function isMemoryRightKind(
  value: unknown,
): value is 'correct' | 'contest' | 'delete' | 'revoke' {
  return value === 'correct' || value === 'contest' || value === 'delete' || value === 'revoke';
}

async function handleConversationTurn(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const conversationId = body['conversationId'];
    const turnId = body['turnId'];
    const text = body['text'];
    const proposeMemory = body['proposeMemory'];
    if (
      typeof conversationId !== 'string' ||
      typeof turnId !== 'string' ||
      typeof text !== 'string' ||
      typeof proposeMemory !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_conversation_turn' });
      return;
    }
    const result = await dependencies.conversation.submitTurn({
      tenantId: dependencies.tenantId,
      actorId,
      conversationId,
      turnId,
      text,
      proposeMemory,
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    });
    sendJson(response, 200, {
      assistantMessage: result.assistantMessage,
      followUpQuestion: result.followUpQuestion,
      ...(result.memoryProposal
        ? {
            memoryProposal: {
              id: result.memoryProposal.id,
              epistemicType: result.memoryProposal.epistemicType,
              dataClass: result.memoryProposal.dataClass,
              status: result.memoryProposal.status,
              occurredAt: result.memoryProposal.occurredAt.toISOString(),
            },
          }
        : {}),
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

async function handleMemoryConfirmation(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  proposalId: string,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const permissions = body['permissions'];
    if (!isBooleanPermissionObject(permissions)) {
      sendJson(response, 400, { error: 'invalid_memory_permissions' });
      return;
    }
    const confirmed = await dependencies.conversation.confirmMemory({
      tenantId: dependencies.tenantId,
      actorId,
      proposalId,
      permissions,
      confirmedAt: (dependencies.clock ?? (() => new Date()))(),
    });
    sendJson(response, 200, {
      assertion: {
        id: confirmed.assertion.id,
        epistemicType: confirmed.assertion.epistemicType,
        dataClass: confirmed.assertion.dataClass,
      },
      permissions: confirmed.permissions,
      confirmedAt: confirmed.confirmedAt.toISOString(),
      persistence: confirmed.persistence,
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

function sendConversationError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof ConversationValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_conversation_input',
    });
    return;
  }
  if (error instanceof MemoryProposalNotFoundError) {
    sendJson(response, 404, { error: 'memory_proposal_not_found' });
    return;
  }
  if (error instanceof MemoryProposalPermissionError) {
    sendJson(response, 403, { error: 'memory_permission_denied' });
    return;
  }
  if (error instanceof MemoryProposalConflictError) {
    sendJson(response, 409, { error: 'memory_proposal_conflict' });
    return;
  }
  sendJson(response, 500, { error: 'conversation_failed' });
}

function isBooleanPermissionObject(value: unknown): value is Readonly<{
  personalUnderstanding: boolean;
  brandUsage: boolean;
  publicUsage: boolean;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['personalUnderstanding'] === 'boolean' &&
    typeof record['brandUsage'] === 'boolean' &&
    typeof record['publicUsage'] === 'boolean'
  );
}

async function handleApproval(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  if (!dependencies.workbench || !dependencies.resolveActor) {
    sendJson(response, 503, { error: 'workbench_unavailable' });
    return;
  }

  const actorId = dependencies.resolveActor(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const actionId = body['actionId'];
    if (typeof actionId !== 'string' || actionId.trim().length === 0) {
      sendJson(response, 400, { error: 'invalid_action_id' });
      return;
    }
    const snapshot = await dependencies.workbench.approve(
      actionId,
      actorId,
      (dependencies.clock ?? (() => new Date()))(),
    );
    sendJson(response, 200, snapshot);
  } catch (error: unknown) {
    if (error instanceof InvalidJsonBodyError) {
      sendJson(response, 400, { error: error.code });
      return;
    }
    if (error instanceof WorkbenchActionNotFoundError) {
      sendJson(response, 404, { error: 'action_not_found' });
      return;
    }
    if (error instanceof WorkbenchApprovalConflictError) {
      sendJson(response, 409, { error: error.reason });
      return;
    }
    sendJson(response, 500, { error: 'approval_failed' });
  }
}

class InvalidJsonBodyError extends Error {
  public constructor(public readonly code: 'invalid_json' | 'request_too_large') {
    super(code);
  }
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 32_768) throw new InvalidJsonBodyError('request_too_large');
    chunks.push(buffer);
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidJsonBodyError('invalid_json');
    }
    return value as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof InvalidJsonBodyError) throw error;
    throw new InvalidJsonBodyError('invalid_json');
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}
