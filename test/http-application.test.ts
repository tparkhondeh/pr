import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationIntakeService } from '../src/conversation/intake.js';
import {
  createRequestHandler,
  type ApplicationDependencies,
} from '../src/http/application.js';
import { tenantId, userId } from '../src/kernel/identity.js';
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
    expect((await workbench.snapshot()).workflow.status).toBe('awaiting_approval');
  });

  it('routes a conversation turn without silently creating memory', async () => {
    const response = await request(
      '/api/conversations/turns',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation_today',
          turnId: 'turn_http_one',
          text: 'امروز در جلسه اتفاق مهمی افتاد.',
          proposeMemory: false,
        }),
      },
      {
        conversation: new ConversationIntakeService(),
        tenantId: tenantId('tenant_primary'),
        resolveActor: () => userId('owner_primary'),
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload['followUpQuestion']).toContain('کدام بخش');
    expect(payload).not.toHaveProperty('memoryProposal');
  });

  it('requires a second explicit request before a self-report enters memory', async () => {
    const fixedTime = new Date('2026-08-31T13:00:00.000Z');
    const conversation = new ConversationIntakeService();
    const dependencies: ApplicationDependencies = {
      conversation,
      tenantId: tenantId('tenant_primary'),
      resolveActor: () => userId('owner_primary'),
      clock: () => fixedTime,
    };
    const proposalResponse = await request(
      '/api/conversations/turns',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation_today',
          turnId: 'turn_http_memory',
          text: 'صداقت در ابهام برای من مهم است.',
          proposeMemory: true,
        }),
      },
      dependencies,
    );
    const proposal = await proposalResponse.json() as {
      memoryProposal: { id: string; status: string };
    };
    expect(proposal.memoryProposal.status).toBe('awaiting_user_confirmation');

    const confirmationResponse = await request(
      `/api/memory/proposals/${proposal.memoryProposal.id}/confirm`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            personalUnderstanding: true,
            brandUsage: false,
            publicUsage: false,
          },
        }),
      },
      dependencies,
    );

    expect(confirmationResponse.status).toBe(200);
    await expect(confirmationResponse.json()).resolves.toMatchObject({
      assertion: { epistemicType: 'self_report', dataClass: 'confidential' },
      permissions: {
        personalUnderstanding: true,
        brandUsage: false,
        publicUsage: false,
      },
    });
  });

  it('routes an idempotent user right over confirmed memory', async () => {
    const fixedTime = new Date('2026-08-31T14:00:00.000Z');
    const conversation = new ConversationIntakeService();
    const dependencies: ApplicationDependencies = {
      conversation,
      tenantId: tenantId('tenant_primary'),
      resolveActor: () => userId('owner_primary'),
      clock: () => fixedTime,
    };
    const proposalResponse = await request(
      '/api/conversations/turns',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation_right_http',
          turnId: 'turn_right_http',
          text: 'این برداشت باید قابل لغو باشد.',
          proposeMemory: true,
        }),
      },
      dependencies,
    );
    const proposal = await proposalResponse.json() as { memoryProposal: { id: string } };
    await request(
      `/api/memory/proposals/${proposal.memoryProposal.id}/confirm`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            personalUnderstanding: true,
            brandUsage: false,
            publicUsage: false,
          },
        }),
      },
      dependencies,
    );
    const body = JSON.stringify({
      requestId: 'right_http_revoke',
      operation: 'revoke',
      reason: 'کاربر مجوز استفاده را صریحاً لغو کرد.',
    });
    const first = await request(
      `/api/memory/proposals/${proposal.memoryProposal.id}/rights`,
      () => ({ ready: true }),
      { method: 'POST', headers: { 'content-type': 'application/json' }, body },
      dependencies,
    );
    const repeated = await request(
      `/api/memory/proposals/${proposal.memoryProposal.id}/rights`,
      () => ({ ready: true }),
      { method: 'POST', headers: { 'content-type': 'application/json' }, body },
      dependencies,
    );

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      outcome: 'applied',
      operation: 'revoke',
      permissionsRevoked: true,
      persistence: 'memory',
    });
    await expect(repeated.json()).resolves.toMatchObject({
      outcome: 'already_applied',
      operation: 'revoke',
    });
  });
});
