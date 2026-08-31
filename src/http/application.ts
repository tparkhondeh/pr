import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ConversationValidationError,
  MemoryProposalConflictError,
  MemoryProposalNotFoundError,
  MemoryProposalPermissionError,
} from '../conversation/intake.js';
import type { ConversationIntakeService } from '../conversation/intake.js';
import type { TenantId, UserId } from '../kernel/identity.js';
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
    if (size > 16_384) throw new InvalidJsonBodyError('request_too_large');
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
