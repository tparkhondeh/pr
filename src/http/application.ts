import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UserId } from '../kernel/identity.js';
import {
  WorkbenchActionNotFoundError,
  WorkbenchApprovalConflictError,
  type InMemoryWorkbenchService,
} from '../workbench/workbench.js';

export type ReadinessCheck = () =>
  | Promise<Readonly<{ ready: boolean; reason?: string }>>
  | Readonly<{ ready: boolean; reason?: string }>;

export type ApplicationDependencies = Readonly<{
  workbench?: Pick<InMemoryWorkbenchService, 'snapshot' | 'approve'>;
  resolveActor?: (request: IncomingMessage) => UserId | undefined;
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
      sendJson(response, 200, dependencies.workbench.snapshot());
      return;
    }

    if (request.method === 'POST' && path === '/api/workbench/approval') {
      await handleApproval(request, response, dependencies);
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
  };
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
    const snapshot = dependencies.workbench.approve(
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
