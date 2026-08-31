import type { IncomingMessage, ServerResponse } from 'node:http';

export type ReadinessCheck = () =>
  | Promise<Readonly<{ ready: boolean; reason?: string }>>
  | Readonly<{ ready: boolean; reason?: string }>;

export function createRequestHandler(readinessCheck: ReadinessCheck) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { status: 'alive' });
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
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

    sendJson(response, 404, { error: 'not_found' });
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Readonly<Record<string, unknown>>,
): void {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

