import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRequestHandler,
  type ApplicationDependencies,
} from '../src/http/application.js';
import { userId } from '../src/kernel/identity.js';
import { createDefaultWorkbenchService } from '../src/workbench/workbench.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

async function request(
  path: string,
  readinessCheck: () => Readonly<{ ready: boolean; reason?: string }>,
  init?: RequestInit,
  dependencies?: ApplicationDependencies,
) {
  const handler = createRequestHandler(readinessCheck, dependencies);
  const server = createServer((incomingRequest, response) => {
    void handler(incomingRequest, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return fetch(`http://127.0.0.1:${String(address.port)}${path}`, init);
}

describe('operational endpoints', () => {
  it('reports liveness without testing dependencies', async () => {
    const response = await request('/health', () => ({ ready: false }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'alive' });
  });

  it('fails readiness closed', async () => {
    const response = await request('/ready', () => ({
      ready: false,
      reason: 'database_unavailable',
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      reason: 'database_unavailable',
    });
  });

  it('serves the live workbench snapshot from application state', async () => {
    const workbench = createDefaultWorkbenchService(
      () => new Date('2026-08-31T12:00:00.000Z'),
    );
    const response = await request(
      '/api/workbench',
      () => ({ ready: true }),
      undefined,
      { workbench },
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      workflow: { status: string };
      actions: { kind: string }[];
    };
    expect(payload.workflow.status).toBe('awaiting_approval');
    expect(payload.actions.some((action) => action.kind === 'no_action')).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('accepts a human approval and returns the evolved workflow', async () => {
    const fixedTime = new Date('2026-08-31T12:05:00.000Z');
    const workbench = createDefaultWorkbenchService(() => fixedTime);
    const response = await request(
      '/api/workbench/approval',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'conversation' }),
      },
      {
        workbench,
        resolveActor: () => userId('owner_primary'),
        clock: () => fixedTime,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      workflow: {
        status: 'approved',
        approvedActionId: 'conversation',
        approvedAt: fixedTime.toISOString(),
      },
    });
  });

  it('fails approval closed without an authenticated actor', async () => {
    const response = await request(
      '/api/workbench/approval',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'conversation' }),
      },
      {
        workbench: createDefaultWorkbenchService(),
        resolveActor: () => undefined,
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'authentication_required' });
  });

  it('rejects malformed approval input without mutating the workflow', async () => {
    const workbench = createDefaultWorkbenchService();
    const dependencies: ApplicationDependencies = {
      workbench,
      resolveActor: () => userId('owner_primary'),
    };
    const response = await request(
      '/api/workbench/approval',
      () => ({ ready: true }),
      { method: 'POST', body: '{' },
      dependencies,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_json' });
    expect(workbench.snapshot().workflow.status).toBe('awaiting_approval');
  });
});
