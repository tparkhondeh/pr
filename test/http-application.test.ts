import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditTrailService, InMemoryAuditTrailRepository } from '../src/account/audit-trail.js';
import {
  DecisionArbitrationService,
  InMemoryArbitrationRepository,
} from '../src/arbitration/decision-arbitration.js';
import {
  InMemoryTextAssetRepository,
  TextAssetIntakeService,
} from '../src/assets/text-asset-intake.js';
import { ConversationIntakeService } from '../src/conversation/intake.js';
import { ContentDraftService, InMemoryDraftWorkspaceRepository } from '../src/claims/workspace.js';
import {
  ClaimGovernanceService,
  InMemoryClaimGovernanceRepository,
} from '../src/claims/governance.js';
import {
  FeedbackLearningService,
  InMemoryFeedbackLearningRepository,
} from '../src/feedback/workspace.js';
import {
  InMemoryInitiativeRepository,
  InitiativePolicyService,
} from '../src/initiative/initiative-policy.js';
import {
  createRequestHandler,
  type ApplicationDependencies,
} from '../src/http/application.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryResearchWorkspaceRepository,
  ResearchWorkspaceService,
} from '../src/research/workspace.js';
import {
  InMemoryRelationshipWorkspaceRepository,
  RelationshipWorkspaceService,
} from '../src/relationships/workspace.js';
import {
  BrandProtectionService,
  InMemoryRiskReviewRepository,
} from '../src/risk/brand-protection.js';
import {
  InMemoryStrategyContextRepository,
  StrategyContextService,
  defaultStrategyContext,
} from '../src/strategy/context.js';
import { InMemoryWorkbenchApprovalRepository } from '../src/workbench/approval-repository.js';
import { OwnerEvidenceContextService } from '../src/workbench/evidence-context.js';
import { createDefaultWorkbenchService } from '../src/workbench/workbench.js';
import { groundedEvidence } from './support/grounded-evidence.js';

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

  it('reports the effective persistence and durability mode', async () => {
    const response = await request('/ready', () => ({
      ready: true,
      persistence: 'memory',
      durability: 'ephemeral',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      persistence: 'memory',
      durability: 'ephemeral',
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

  it('creates an auditable arbitration case without granting execution authority', async () => {
    const fixedTime = new Date('2026-08-31T12:03:00.000Z');
    const owner = userId('owner_primary');
    const activeTenant = tenantId('tenant_primary');
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      undefined,
      { tenantId: activeTenant, ownerUserId: owner },
      undefined,
      groundedEvidence(fixedTime),
    );
    const risk = new BrandProtectionService(new InMemoryRiskReviewRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const arbitration = new DecisionArbitrationService(
      new InMemoryArbitrationRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      { workbench, risk },
    );
    const auditTrail = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const dependencies: ApplicationDependencies = {
      workbench,
      risk,
      arbitration,
      mutationAuditTrail: auditTrail,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };

    const created = await request(
      '/api/arbitration/cases',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'arbitration_http_wait',
          actionId: 'wait',
          requestedAutonomyLevel: 7,
        }),
      },
      dependencies,
    );
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      outcome: 'applied',
      persistence: 'memory',
      case: {
        policyVersion: 'intermodule-arbitration-v1',
        request: { requestedAutonomyLevel: 7, writeAuthority: 'append_decision_only' },
        decision: {
          outcome: 'approval_required',
          effectiveAutonomyLevel: 5,
          executionPermitted: false,
          downgradeReasons: ['mvp_execution_disabled'],
        },
      },
    });

    const replay = await request(
      '/api/arbitration/cases',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'arbitration_http_wait',
          actionId: 'wait',
          requestedAutonomyLevel: 7,
        }),
      },
      dependencies,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ outcome: 'already_applied' });

    const workspace = await request(
      '/api/arbitration',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    await expect(workspace.json()).resolves.toMatchObject({
      policyVersion: 'intermodule-arbitration-v1',
      mvpExecutionEnabled: false,
      cases: [{ stale: false, decision: { executionPermitted: false } }],
    });
    const activity = await auditTrail.snapshot(owner, fixedTime);
    expect(activity.events.filter((event) => event.eventType === 'decision.arbitrated')).toHaveLength(1);
  });

  it('fails arbitration closed without an authenticated owner', async () => {
    const response = await request(
      '/api/arbitration/cases',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'arbitration_unauthenticated',
          actionId: 'wait',
          requestedAutonomyLevel: 2,
        }),
      },
      {
        arbitration: {
          snapshot: () => Promise.reject(new Error('must not be called')),
          assess: () => Promise.reject(new Error('must not be called')),
        },
      },
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'authentication_required' });
  });

  it('keeps proactive cues owner-configured, relevant and rate-limited', async () => {
    let clock = new Date('2026-09-01T01:10:00.000Z');
    const owner = userId('owner_primary');
    const activeTenant = tenantId('tenant_primary');
    const workbench = createDefaultWorkbenchService(
      () => clock,
      undefined,
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const risk = new BrandProtectionService(new InMemoryRiskReviewRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const arbitration = new DecisionArbitrationService(
      new InMemoryArbitrationRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      { workbench, risk },
    );
    const initiative = new InitiativePolicyService(
      new InMemoryInitiativeRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      { workbench, arbitration },
    );
    const auditTrail = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const dependencies: ApplicationDependencies = {
      workbench,
      arbitration,
      initiative,
      mutationAuditTrail: auditTrail,
      resolveActor: () => owner,
      clock: () => clock,
    };

    const initial = await request('/api/initiative', () => ({ ready: true }), undefined, dependencies);
    await expect(initial.json()).resolves.toMatchObject({
      policyVersion: 'initiative-policy-v1',
      settings: { mode: 'reactive', revision: 1 },
      preview: { decision: 'suppressed', reason: 'reactive_mode', candidate: { relevance: 0.9 } },
    });

    const settings = await request(
      '/api/initiative/settings',
      () => ({ ready: true }),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'initiative_http_settings',
          expectedRevision: 1,
          mode: 'balanced',
          maxPromptsPer24Hours: 1,
          minimumRelevance: 0.75,
          pausedUntil: null,
        }),
      },
      dependencies,
    );
    expect(settings.status).toBe(200);
    await expect(settings.json()).resolves.toMatchObject({
      outcome: 'saved', settings: { mode: 'balanced', revision: 2 },
    });

    clock = new Date(clock.getTime() + 1_000);
    const first = await request(
      '/api/initiative/evaluations',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'initiative_http_first' }),
      },
      dependencies,
    );
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({
      outcome: 'evaluated',
      evaluation: { decision: 'delivered', reason: 'delivered', candidate: { kind: 'evidence_question' } },
    });

    clock = new Date(clock.getTime() + 1_000);
    const second = await request(
      '/api/initiative/evaluations',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'initiative_http_second' }),
      },
      dependencies,
    );
    await expect(second.json()).resolves.toMatchObject({
      evaluation: { decision: 'suppressed', reason: 'rate_limited' },
    });

    const activity = await auditTrail.snapshot(owner, clock);
    expect(activity.events.filter((event) => event.eventType === 'initiative.settings_updated')).toHaveLength(1);
    expect(activity.events.filter((event) => event.eventType === 'initiative.evaluated')).toHaveLength(2);
  });

  it('records and hard-deletes consented stakeholder context without contact authority', async () => {
    const fixedTime = new Date('2026-08-31T12:00:00.000Z');
    const owner = userId('owner_primary');
    const activeTenant = tenantId('tenant_primary');
    const relationships = new RelationshipWorkspaceService(
      new InMemoryRelationshipWorkspaceRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const auditTrail = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const dependencies: ApplicationDependencies = {
      relationships,
      mutationAuditTrail: auditTrail,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };
    const body = {
      requestId: 'relationship_http_create',
      label: 'همکار قابل‌اعتماد',
      group: 'peer',
      outcome: 'تقویت همکاری عمیق و بلندمدت',
      priority: 'high',
      strength: 'trusted',
      boundary: 'normal',
      contextNote: 'این یادداشت فقط برای مرور زمینه‌ی خصوصی رابطه ثبت می‌شود.',
      lastInteractionAt: '2026-04-01T12:00:00.000Z',
      consentConfirmed: true,
    };
    const created = await request(
      '/api/relationships/stakeholders',
      () => ({ ready: true }),
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      dependencies,
    );
    expect(created.status).toBe(201);
    const createdPayload = await created.json() as { record: { stakeholderId: string } };
    expect(createdPayload).toMatchObject({
      outcome: 'applied',
      persistence: 'memory',
      record: { label: 'همکار قابل‌اعتماد', group: 'peer' },
    });

    const snapshot = await request('/api/relationships', () => ({ ready: true }), undefined, dependencies);
    await expect(snapshot.json()).resolves.toMatchObject({
      policyVersion: 'relationship-intelligence-v1',
      summary: { totalStakeholders: 1, reviewSuggested: 1 },
      stakeholders: [{
        attention: 'review_context',
        privacy: { contactDetailsStored: false, automationPermitted: false, outboundContactPermitted: false },
      }],
    });

    const deleted = await request(
      `/api/relationships/stakeholders/${createdPayload.record.stakeholderId}/delete`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'relationship_http_delete' }),
      },
      dependencies,
    );
    await expect(deleted.json()).resolves.toMatchObject({ outcome: 'deleted' });
    const replay = await request(
      `/api/relationships/stakeholders/${createdPayload.record.stakeholderId}/delete`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'relationship_http_delete' }),
      },
      dependencies,
    );
    await expect(replay.json()).resolves.toMatchObject({ outcome: 'already_applied' });
    const relationshipActivity = (await auditTrail.snapshot(owner, fixedTime)).events;
    expect(relationshipActivity).toHaveLength(2);
    expect((await auditTrail.snapshot(owner, fixedTime)).summary.dataRights).toBe(1);
    expect(JSON.stringify(relationshipActivity)).not.toContain('همکار قابل‌اعتماد');
    expect(JSON.stringify(relationshipActivity)).not.toContain('زمینه‌ی خصوصی رابطه');
  });

  it('accepts a human approval and returns the evolved workflow', async () => {
    const fixedTime = new Date('2026-08-31T12:05:00.000Z');
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      undefined,
      { tenantId: 'tenant_primary', ownerUserId: 'owner_primary' },
      undefined,
      groundedEvidence(fixedTime),
    );
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

  it('requires a current owner risk acknowledgement before a yellow action approval', async () => {
    const fixedTime = new Date('2026-08-31T12:06:00.000Z');
    const owner = userId('owner_primary');
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      undefined,
      { tenantId: 'tenant_primary', ownerUserId: 'owner_primary' },
      undefined,
      groundedEvidence(fixedTime),
    );
    const risk = new BrandProtectionService(new InMemoryRiskReviewRepository(), {
      tenantId: tenantId('tenant_primary'),
      ownerUserId: owner,
    });
    const dependencies: ApplicationDependencies = {
      workbench,
      risk,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };

    const blocked = await request('/api/workbench/approval', () => ({ ready: true }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionId: 'conversation' }),
    }, dependencies);
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toEqual({ error: 'risk_review_required' });

    const riskResponse = await request('/api/risk', () => ({ ready: true }), undefined, dependencies);
    const riskSnapshot = await riskResponse.json() as {
      policyVersion: string;
      assessments: Array<{ actionId: string; level: 'yellow'; assessmentHash: string }>;
    };
    const conversationRisk = riskSnapshot.assessments.find((item) => item.actionId === 'conversation');
    if (!conversationRisk) throw new Error('Expected conversation risk assessment.');
    expect(riskSnapshot.policyVersion).toBe('brand-protection-v1');

    const review = await request('/api/risk/actions/conversation/reviews', () => ({ ready: true }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: 'risk_http_conversation',
        expectedLevel: conversationRisk.level,
        expectedAssessmentHash: conversationRisk.assessmentHash,
        decision: 'acknowledge',
        rationale: 'حریم شخص ثالث و زمان‌بندی گفت‌وگو را مرور کردم و اطلاعات اضافی را وارد نمی‌کنم.',
        humanAttestation: true,
      }),
    }, dependencies);
    expect(review.status).toBe(201);

    const approved = await request('/api/workbench/approval', () => ({ ready: true }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionId: 'conversation' }),
    }, dependencies);
    expect(approved.status).toBe(200);
    await expect(approved.json()).resolves.toMatchObject({
      workflow: { status: 'approved', approvedActionId: 'conversation' },
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

  it('records external research separately with citation and freshness metadata', async () => {
    const fixedTime = new Date('2026-08-31T18:00:00.000Z');
    const tenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const research = new ResearchWorkspaceService(
      new InMemoryResearchWorkspaceRepository(),
      { tenantId: tenant, ownerUserId: owner },
    );
    const dependencies: ApplicationDependencies = {
      research,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };
    const created = await request(
      '/api/research/sources',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'research_http_source',
          title: 'گزارش رسمی درباره اعتماد سازمانی',
          publisher: 'مرکز پژوهش نمونه',
          url: 'https://research.example.org/report',
          excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را بررسی می‌کند.',
          statement: 'شفافیت تصمیم می‌تواند اعتماد سازمانی را حفظ کند.',
          quality: 'primary',
          stance: 'supports',
          publishedAt: '2026-08-01T00:00:00.000Z',
          maxAgeDays: 90,
        }),
      },
      dependencies,
    );
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      outcome: 'applied',
      persistence: 'memory',
      record: { quality: 'primary', stance: 'supports' },
    });

    const snapshotResponse = await request(
      '/api/research',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    expect(snapshotResponse.status).toBe(200);
    const researchSnapshot = await snapshotResponse.json() as {
      summary: { totalSources: number; citationReady: number; conflicts: number };
      sources: Array<{ factCheckStatus: string; usableForPublicClaim: boolean; citation: string }>;
    };
    expect(researchSnapshot).toMatchObject({
      summary: { totalSources: 1, citationReady: 1, conflicts: 0 },
      sources: [{
        factCheckStatus: 'citation_ready',
        usableForPublicClaim: true,
      }],
    });
    expect(researchSnapshot.sources[0]?.citation).toContain('https://research.example.org/report');
  });

  it('exposes human claim review without treating citation as automatic verification', async () => {
    const fixedTime = new Date('2026-08-31T18:00:00.000Z');
    const tenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const research = new ResearchWorkspaceService(
      new InMemoryResearchWorkspaceRepository(),
      { tenantId: tenant, ownerUserId: owner },
    );
    const imported = await research.importSource({
      actorId: owner,
      requestId: 'claim_http_source',
      title: 'گزارش رسمی اعتماد سازمانی',
      publisher: 'مرکز پژوهش نمونه',
      url: 'https://research.example.org/report',
      excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را به‌صورت مستند بررسی می‌کند.',
      statement: 'بر اساس این تحقیق، شفافیت تصمیم اعتماد سازمانی را حفظ می‌کند.',
      quality: 'primary',
      stance: 'supports',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      maxAgeDays: 90,
      accessedAt: fixedTime,
    });
    const claims = new ClaimGovernanceService(
      new InMemoryClaimGovernanceRepository(),
      { tenantId: tenant, ownerUserId: owner },
      { drafts: { snapshot: () => Promise.resolve(null) }, research },
    );
    const dependencies: ApplicationDependencies = {
      claims,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };
    const before = await request('/api/claims', () => ({ ready: true }), undefined, dependencies);
    await expect(before.json()).resolves.toMatchObject({
      summary: { totalClaims: 1, verified: 0, publicReady: 0 },
      claims: [{ claimId: imported.record.claimId, status: 'proposed', traceStatus: 'complete' }],
    });
    const blocked = await request(
      `/api/claims/${imported.record.claimId}/reviews`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'claim_http_review_blocked',
          expectedStatus: 'proposed',
          decision: 'verify',
          rationale: 'بازبین باید پیش از تأیید، Source و Evidence را شخصاً تطبیق دهد.',
          humanAttestation: false,
        }),
      },
      dependencies,
    );
    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toEqual({ error: 'attestation_required' });

    const verified = await request(
      `/api/claims/${imported.record.claimId}/reviews`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'claim_http_review_verified',
          expectedStatus: 'proposed',
          decision: 'verify',
          rationale: 'من Source، تاریخ، Excerpt و Statement را با سند اصلی تطبیق دادم.',
          humanAttestation: true,
        }),
      },
      dependencies,
    );
    expect(verified.status).toBe(201);
    await expect(verified.json()).resolves.toMatchObject({
      review: { resultingStatus: 'verified' },
    });
    const after = await request('/api/claims', () => ({ ready: true }), undefined, dependencies);
    await expect(after.json()).resolves.toMatchObject({
      summary: { verified: 1, publicReady: 0 },
      claims: [{ status: 'verified', canUsePublicly: false }],
    });
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
    expect(payload['orchestration']).toMatchObject({
      policyVersion: 'conversation-orchestrator-v1',
      intent: { kind: 'reflect' },
      route: { module: 'conversation', writeAuthority: 'none' },
      provenance: { personalMemoryUsed: false, externalResearchUsed: false },
    });
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

  it('serves an owner-scoped memory snapshot and redacts deleted text', async () => {
    let now = new Date('2026-08-31T15:00:00.000Z');
    const conversation = new ConversationIntakeService();
    const dependencies: ApplicationDependencies = {
      conversation,
      tenantId: tenantId('tenant_primary'),
      resolveActor: () => userId('owner_primary'),
      clock: () => now,
    };
    const proposalResponse = await request(
      '/api/conversations/turns',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation_memory_snapshot',
          turnId: 'turn_memory_snapshot',
          text: 'این متن پس از حذف نباید از API برگردد.',
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
    now = new Date('2026-08-31T15:01:00.000Z');
    await request(
      `/api/memory/proposals/${proposal.memoryProposal.id}/rights`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'right_http_snapshot_delete',
          operation: 'delete',
          reason: 'درخواست صریح حذف از نمای حافظه.',
        }),
      },
      dependencies,
    );
    const response = await request('/api/memory', () => ({ ready: true }), undefined, dependencies);
    const payload = await response.json() as {
      summary: { deleted: number };
      records: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(payload.summary.deleted).toBe(1);
    expect(payload.records[0]).toMatchObject({
      proposalId: proposal.memoryProposal.id,
      text: null,
      lifecycle: { status: 'deleted' },
    });
    expect(JSON.stringify(payload)).not.toContain('tenant_primary');
    expect(JSON.stringify(payload)).not.toContain('این متن پس از حذف');
  });

  it('saves an owner strategy version and makes stale workbench approval expire', async () => {
    const fixedTime = new Date('2026-08-31T17:00:00.000Z');
    const activeTenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const approval = new InMemoryWorkbenchApprovalRepository();
    const strategy = new StrategyContextService(
      new InMemoryStrategyContextRepository(
        defaultStrategyContext(activeTenant, owner),
        approval,
      ),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      approval,
      { tenantId: activeTenant, ownerUserId: owner },
      strategy,
      groundedEvidence(fixedTime),
    );
    const dependencies: ApplicationDependencies = {
      workbench,
      strategy,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };
    await workbench.approve('conversation', owner, fixedTime);

    const before = await request('/api/strategy', () => ({ ready: true }), undefined, dependencies);
    expect(before.status).toBe(200);
    const current = await before.json() as Record<string, unknown>;
    expect(current['revision']).toBe(1);

    const response = await request(
      '/api/strategy',
      () => ({ ready: true }),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'strategy_http_update',
          expectedRevision: 1,
          value: {
            goal: {
              title: 'مرجع تصمیم‌گیری قابل‌اعتماد',
              outcome: 'سه گفت‌وگوی عمیق با تصمیم‌گیران منتخب',
              priority: 5,
              successMetrics: ['کیفیت تعامل'],
              horizon: 'سه ماه آینده',
            },
            desiredPositioning: {
              audience: 'مدیران ارشد',
              desiredPerception: 'دقیق، صادق و قابل‌اعتماد',
              differentiation: 'شواهد قابل‌ردیابی به‌جای نمایش‌گری',
              proofPoints: ['تصمیم‌های مستند'],
              horizon: 'سه ماه آینده',
            },
          },
        }),
      },
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: 'saved',
      revision: 2,
      goal: { title: 'مرجع تصمیم‌گیری قابل‌اعتماد' },
    });
    const workbenchAfter = await workbench.snapshot();
    expect(workbenchAfter.goal).toMatchObject({ revision: 2, title: 'مرجع تصمیم‌گیری قابل‌اعتماد' });
    expect(workbenchAfter.workflow.status).toBe('awaiting_approval');
    expect(workbenchAfter.workflow).not.toHaveProperty('approvedActionId');
  });

  it('routes the evidence-bound draft through approval and export without publishing', async () => {
    const fixedTime = new Date('2026-08-31T19:00:00.000Z');
    const activeTenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const conversation = new ConversationIntakeService();
    const assets = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const approval = new InMemoryWorkbenchApprovalRepository();
    const strategy = new StrategyContextService(
      new InMemoryStrategyContextRepository(defaultStrategyContext(activeTenant, owner), approval),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      approval,
      { tenantId: activeTenant, ownerUserId: owner },
      strategy,
      new OwnerEvidenceContextService(
        assets,
        conversation,
        { tenantId: activeTenant, ownerUserId: owner },
        () => fixedTime,
      ),
    );
    const proposalResult = await conversation.submitTurn({
      tenantId: activeTenant,
      actorId: owner,
      conversationId: 'conversation_http_draft',
      turnId: 'turn_http_draft',
      text: 'در یک تصمیم دشوار، شفافیت را به نمایش قطعیت ترجیح دادم.',
      proposeMemory: true,
      occurredAt: fixedTime,
    });
    if (!proposalResult.memoryProposal) throw new Error('Draft source proposal missing.');
    await conversation.confirmMemory({
      tenantId: activeTenant,
      actorId: owner,
      proposalId: proposalResult.memoryProposal.id,
      permissions: { personalUnderstanding: true, brandUsage: true, publicUsage: false },
      confirmedAt: fixedTime,
    });
    await workbench.approve('essay', owner, fixedTime);
    const drafts = new ContentDraftService(
      new InMemoryDraftWorkspaceRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      conversation,
      workbench,
      strategy,
      undefined,
      assets,
    );
    const dependencies: ApplicationDependencies = {
      drafts,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };
    const sourcesResponse = await request(
      '/api/drafts/sources',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    expect(sourcesResponse.status).toBe(200);
    await expect(sourcesResponse.json()).resolves.toMatchObject({
      records: [{
        kind: 'memory',
        ref: proposalResult.memoryProposal.id,
        evidenceIds: ['evidence_turn_http_draft'],
      }],
    });
    const createdResponse = await request(
      '/api/drafts',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'draft_http_create',
          sourceKind: 'memory',
          sourceRef: proposalResult.memoryProposal.id,
          channel: 'linkedin',
          narrativeAngle: 'شفافیت در تصمیم‌های دشوار',
          takeaway: 'اعتماد با صداقت درباره ابهام ساخته می‌شود.',
          publicDraftingConsent: true,
        }),
      },
      dependencies,
    );
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json() as { draftId: string; revision: number; body: string };
    const approvedResponse = await request(
      `/api/drafts/${created.draftId}/approve`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'draft_http_approve', expectedRevision: created.revision }),
      },
      dependencies,
    );
    const approved = await approvedResponse.json() as { revision: number; status: string };
    expect(approved).toMatchObject({ revision: 2, status: 'approved' });
    const exportResponse = await request(
      `/api/drafts/${created.draftId}/export`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'draft_http_export', expectedRevision: approved.revision }),
      },
      dependencies,
    );
    const exported = await exportResponse.json() as { content: string; filename: string; draft: { status: string } };
    expect(exportResponse.status).toBe(200);
    expect(exported.content).toBe(created.body);
    expect(exported.filename).toMatch(/\.txt$/u);
    expect(exported.draft.status).toBe('exported');
  });

  it('exposes preference proposals for explicit apply and reversible decisions', async () => {
    const activeTenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const learning = new FeedbackLearningService(
      new InMemoryFeedbackLearningRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const before = `یک تیتر طولانی برای آزمون یادگیری\n\n${'متن '.repeat(80)}`;
    const after = `تیتر کوتاه\n\n${'متن '.repeat(20)}`;
    for (const [index, requestId] of ['feedback_http_one', 'feedback_http_two', 'feedback_http_three'].entries()) {
      await learning.recordDraftEdit({
        actorId: owner,
        requestId,
        draftId: `draft_http_${String(index)}`,
        before,
        after,
        occurredAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T20:00:00Z`),
      });
    }
    const dependencies: ApplicationDependencies = {
      learning,
      resolveActor: () => owner,
      clock: () => new Date('2026-08-31T20:00:00Z'),
    };
    const snapshotResponse = await request('/api/feedback', () => ({ ready: true }), undefined, dependencies);
    const snapshot = await snapshotResponse.json() as {
      summary: { proposed: number };
      preferences: Array<{ id: string; status: string }>;
    };
    expect(snapshotResponse.status).toBe(200);
    expect(snapshot.summary.proposed).toBeGreaterThan(0);
    const proposal = snapshot.preferences[0];
    if (!proposal) throw new Error('Expected HTTP preference proposal.');

    const decisionResponse = await request(
      `/api/feedback/preferences/${proposal.id}/decision`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'preference_http_apply', decision: 'applied' }),
      },
      dependencies,
    );
    expect(decisionResponse.status).toBe(200);
    await expect(decisionResponse.json()).resolves.toMatchObject({
      summary: { applied: 1 },
    });
  });

  it('imports a consented text asset and derives onboarding maturity from real evidence', async () => {
    const activeTenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const fixedTime = new Date('2026-08-31T21:00:00.000Z');
    const assets = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const conversation = new ConversationIntakeService();
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      undefined,
      { tenantId: activeTenant, ownerUserId: owner },
      undefined,
      new OwnerEvidenceContextService(
        assets,
        conversation,
        { tenantId: activeTenant, ownerUserId: owner },
        () => fixedTime,
      ),
    );
    const auditTrail = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const dependencies: ApplicationDependencies = {
      assets,
      conversation,
      workbench,
      auditTrail,
      mutationAuditTrail: auditTrail,
      tenantId: activeTenant,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };
    const body = {
      requestId: 'asset_http_note',
      title: 'یادداشت جلسه تصمیم‌گیری',
      content: 'در جلسه تصمیم‌گیری، بیان شفاف محدودیت‌ها باعث شد گفت‌وگو قابل‌اعتماد بماند.',
      assertionText: 'من هنگام تصمیم‌گیری، شفافیت درباره محدودیت‌ها را به نمایش قطعیت ترجیح می‌دهم.',
      occurredAt: '2026-08-20T12:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: false },
    };
    const first = await request('/api/assets/text', () => ({ ready: true }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, dependencies);
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({
      outcome: 'applied',
      persistence: 'memory',
      record: {
        title: body.title,
        sourceType: 'text_asset',
        permissions: { personalUnderstanding: true, brandUsage: false },
      },
    });

    const repeated = await request('/api/assets/text', () => ({ ready: true }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, dependencies);
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ outcome: 'already_applied' });

    const onboarding = await request(
      '/api/onboarding',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    expect(onboarding.status).toBe(200);
    await expect(onboarding.json()).resolves.toMatchObject({
      modelMaturity: {
        percent: 23,
        evidenceCount: 1,
        sourceTypes: ['text_asset'],
        components: { importedEvidence: 15, sourceDiversity: 8 },
      },
      strategyReadiness: {
        ready: false,
        evidenceCount: 0,
        withheldEvidenceCount: 1,
        sourceTypes: [],
      },
      assets: { summary: { assets: 1, evidenceItems: 1, assertions: 1 } },
    });
    const coldSnapshot = await workbench.snapshot();
    expect(coldSnapshot.evidence).toMatchObject({
      state: 'insufficient', strategyEvidenceCount: 0, withheldEvidenceCount: 1,
    });
    expect(coldSnapshot.actions[0]).toMatchObject({
      id: 'collect_evidence', interaction: 'open_intake',
    });

    const grounded = await request('/api/assets/text', () => ({ ready: true }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        requestId: 'asset_http_brand_note',
        title: 'یادداشت دوم برای تحلیل برند',
        content: 'در یک تجربه دیگر، توضیح محدودیت‌های تصمیم به حفظ اعتماد و انتخاب مسئولانه کمک کرد.',
        assertionText: 'توضیح محدودیت‌ها را بخشی از تصمیم مسئولانه و اعتمادساز می‌دانم.',
        permissions: { personalUnderstanding: true, brandUsage: true },
      }),
    }, dependencies);
    expect(grounded.status).toBe(201);
    const groundedPayload = await grounded.json() as { record: { assetId: string } };
    const groundedSnapshot = await workbench.snapshot();
    expect(groundedSnapshot.evidence).toMatchObject({
      state: 'grounded', strategyEvidenceCount: 1, withheldEvidenceCount: 1,
    });
    expect(groundedSnapshot.actions[0]).toMatchObject({
      id: 'conversation', evidenceState: 'grounded', interaction: 'approve',
    });

    const revokeBody = {
      requestId: 'asset_http_revoke_brand',
      operation: 'revoke_brand_usage',
      reason: 'دیگر در تحلیل برند استفاده نشود.',
    };
    const revoked = await request(
      `/api/assets/text/${groundedPayload.record.assetId}/rights`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(revokeBody),
      },
      dependencies,
    );
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toMatchObject({
      outcome: 'applied', operation: 'revoke_brand_usage', brandUsage: false, deleted: false,
    });
    const repeatedRevoke = await request(
      `/api/assets/text/${groundedPayload.record.assetId}/rights`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(revokeBody),
      },
      dependencies,
    );
    await expect(repeatedRevoke.json()).resolves.toMatchObject({ outcome: 'already_applied' });
    expect((await workbench.snapshot()).evidence).toMatchObject({
      state: 'insufficient', strategyEvidenceCount: 0, withheldEvidenceCount: 2,
    });

    const deleted = await request(
      `/api/assets/text/${groundedPayload.record.assetId}/rights`,
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: 'asset_http_delete',
          operation: 'delete',
          reason: 'این منبع و مشتقات فعال آن حذف شوند.',
        }),
      },
      dependencies,
    );
    await expect(deleted.json()).resolves.toMatchObject({ deleted: true });
    const afterDelete = await request('/api/onboarding', () => ({ ready: true }), undefined, dependencies);
    await expect(afterDelete.json()).resolves.toMatchObject({
      modelMaturity: { components: { exercisedDataControl: 10 } },
      assets: { summary: { assets: 1, evidenceItems: 1, assertions: 1, dataRights: 2 } },
      strategyReadiness: { evidenceCount: 0, withheldEvidenceCount: 1 },
    });
    const activity = await auditTrail.snapshot(owner, fixedTime);
    expect(activity.events.filter((event) => event.eventType === 'asset.text_imported')).toHaveLength(2);
    expect(activity.summary.dataRights).toBe(2);
  });

  it('exposes an owner audit trail and a portable, auditable account export', async () => {
    const activeTenant = tenantId('tenant_primary');
    const owner = userId('owner_primary');
    const fixedTime = new Date('2026-08-31T22:00:00.000Z');
    const approval = new InMemoryWorkbenchApprovalRepository();
    const strategy = new StrategyContextService(
      new InMemoryStrategyContextRepository(defaultStrategyContext(activeTenant, owner), approval),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      approval,
      { tenantId: activeTenant, ownerUserId: owner },
      strategy,
      groundedEvidence(fixedTime),
    );
    const conversation = new ConversationIntakeService();
    const learning = new FeedbackLearningService(
      new InMemoryFeedbackLearningRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const drafts = new ContentDraftService(
      new InMemoryDraftWorkspaceRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      conversation,
      workbench,
      strategy,
      learning,
    );
    const auditTrail = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const assets = new TextAssetIntakeService(new InMemoryTextAssetRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const research = new ResearchWorkspaceService(
      new InMemoryResearchWorkspaceRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const relationships = new RelationshipWorkspaceService(
      new InMemoryRelationshipWorkspaceRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
    );
    await relationships.create({
      actorId: owner,
      requestId: 'relationship_export_record',
      label: 'ذی‌نفع خصوصی',
      group: 'client',
      outcome: 'حفظ اعتماد در تعامل‌های کلیدی',
      priority: 'high',
      strength: 'active',
      boundary: 'ask_before_prompt',
      contextNote: 'این Context فقط در Export خصوصی مالک دیده می‌شود.',
      lastInteractionAt: fixedTime,
      consentConfirmed: true,
      occurredAt: fixedTime,
    });
    const dependencies: ApplicationDependencies = {
      workbench,
      strategy,
      conversation,
      drafts,
      learning,
      auditTrail,
      assets,
      research,
      relationships,
      mutationAuditTrail: auditTrail,
      tenantId: activeTenant,
      resolveActor: () => owner,
      clock: () => fixedTime,
    };

    const approvalResponse = await request(
      '/api/workbench/approval',
      () => ({ ready: true }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'conversation' }),
      },
      dependencies,
    );
    expect(approvalResponse.status).toBe(200);

    const activityResponse = await request(
      '/api/account/activity',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    const activity = await activityResponse.json() as {
      summary: { total: number; approvals: number };
      events: Array<{ eventType: string; metadata: Record<string, unknown> }>;
    };
    expect(activityResponse.status).toBe(200);
    expect(activity.summary).toEqual(expect.objectContaining({ total: 1, approvals: 1 }));
    expect(activity.events[0]).toMatchObject({
      eventType: 'workbench.action_approved',
      metadata: { actionId: 'conversation' },
    });

    const exportResponse = await request(
      '/api/account/export',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    const portable = await exportResponse.json() as {
      schemaVersion: number;
      scope: string;
      data: {
        memory: { records: unknown[] };
        assets: { records: unknown[] };
        research: { sources: unknown[] };
        relationships: { stakeholders: unknown[] };
        activity: { events: unknown[] };
      };
    };
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('content-disposition')).toContain('pr-personal-data-2026-08-31.json');
    expect(portable).toMatchObject({
      schemaVersion: 1,
      scope: 'owner_portable_data',
      data: {
        memory: { records: [] },
        assets: { records: [] },
        research: { sources: [] },
        relationships: { summary: { totalStakeholders: 1 } },
      },
    });
    expect(portable.data.relationships.stakeholders).toHaveLength(1);
    expect(portable.data.activity.events).toHaveLength(1);

    const activityAfterExport = await request(
      '/api/account/activity',
      () => ({ ready: true }),
      undefined,
      dependencies,
    );
    const activityAfter = await activityAfterExport.json() as {
      summary: { total: number; exports: number };
      events: Array<{ eventType: string }>;
    };
    expect(activityAfter.summary).toMatchObject({ total: 2, exports: 1 });
    expect(activityAfter.events.some((event) => event.eventType === 'account.data_exported')).toBe(true);
  });
});
