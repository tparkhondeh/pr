import { describe, expect, it } from 'vitest';
import type { ArbitrationWorkspaceSnapshot } from '../src/arbitration/decision-arbitration.js';
import {
  InMemoryInitiativeRepository,
  InitiativeConflictError,
  InitiativePolicyService,
} from '../src/initiative/initiative-policy.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import type { WorkbenchAction, WorkbenchSnapshot } from '../src/workbench/workbench.js';
import { testAttentionBudget, testDecisionContract, testDecisionFrame } from './support/strategic-decision.js';

const tenant = tenantId('tenant_primary');
const owner = userId('owner_primary');
const now = new Date('2026-09-01T01:00:00.000Z');

describe('controlled proactive initiative policy', () => {
  it('defaults to reactive mode and suppresses a relevant cue', async () => {
    const service = createService(() => coldWorkbench());
    const workspace = await service.snapshot(owner, now);
    const result = await service.evaluate({ actorId: owner, requestId: 'initiative_reactive_1', occurredAt: now });

    expect(workspace).toMatchObject({
      policyVersion: 'initiative-policy-v1',
      settings: { mode: 'reactive', revision: 1 },
      preview: {
        decision: 'suppressed',
        reason: 'reactive_mode',
        candidate: { kind: 'evidence_question', relevance: 0.9 },
      },
    });
    expect(result).toMatchObject({
      outcome: 'evaluated',
      persistence: 'memory',
      evaluation: { decision: 'suppressed', reason: 'reactive_mode' },
    });
  });

  it('delivers at most the configured number of prompts in a rolling 24-hour window', async () => {
    const service = createService(() => coldWorkbench());
    await service.updateSettings({
      actorId: owner,
      requestId: 'initiative_settings_balanced',
      expectedRevision: 1,
      value: {
        mode: 'balanced',
        maxPromptsPer24Hours: 1,
        minimumRelevance: 0.75,
        pausedUntil: null,
      },
      occurredAt: now,
    });
    const first = await service.evaluate({
      actorId: owner,
      requestId: 'initiative_balanced_first',
      occurredAt: new Date(now.getTime() + 1_000),
    });
    const second = await service.evaluate({
      actorId: owner,
      requestId: 'initiative_balanced_second',
      occurredAt: new Date(now.getTime() + 2_000),
    });
    const workspace = await service.snapshot(owner, new Date(now.getTime() + 3_000));

    expect(first.evaluation).toMatchObject({ decision: 'delivered', reason: 'delivered' });
    expect(second.evaluation).toMatchObject({ decision: 'suppressed', reason: 'rate_limited' });
    expect(workspace.window).toMatchObject({ delivered: 1, remaining: 0 });
  });

  it('applies the relevance threshold independently of proactive mode', async () => {
    const service = createService(() => coldWorkbench());
    await service.updateSettings({
      actorId: owner,
      requestId: 'initiative_settings_threshold',
      expectedRevision: 1,
      value: {
        mode: 'proactive',
        maxPromptsPer24Hours: 3,
        minimumRelevance: 0.95,
        pausedUntil: null,
      },
      occurredAt: now,
    });
    const result = await service.evaluate({
      actorId: owner,
      requestId: 'initiative_threshold_eval',
      occurredAt: new Date(now.getTime() + 1_000),
    });
    expect(result.evaluation).toMatchObject({
      decision: 'suppressed',
      reason: 'below_relevance',
      candidate: { relevance: 0.9 },
    });
  });

  it('replays an identical evaluation and rejects conflicting reuse of its request id', async () => {
    let workbench = coldWorkbench();
    const service = createService(() => workbench);
    const input = { actorId: owner, requestId: 'initiative_idempotent', occurredAt: now } as const;
    const first = await service.evaluate(input);
    const replay = await service.evaluate(input);
    workbench = groundedWorkbench();

    expect(first.outcome).toBe('evaluated');
    expect(replay.outcome).toBe('already_evaluated');
    await expect(service.evaluate(input)).rejects.toBeInstanceOf(InitiativeConflictError);
  });

  it('marks a recorded cue stale after its decision context changes', async () => {
    let workbench = coldWorkbench();
    const service = createService(() => workbench);
    await service.evaluate({ actorId: owner, requestId: 'initiative_stale', occurredAt: now });
    workbench = groundedWorkbench();
    const snapshot = await service.snapshot(owner, new Date(now.getTime() + 1_000));
    expect(snapshot.evaluations[0]).toMatchObject({ stale: true });
  });
});

function createService(workbench: () => WorkbenchSnapshot): InitiativePolicyService {
  return new InitiativePolicyService(
    new InMemoryInitiativeRepository(),
    { tenantId: tenant, ownerUserId: owner },
    {
      workbench: { snapshot: () => Promise.resolve(workbench()) },
      arbitration: { snapshot: () => Promise.resolve(arbitrationSnapshot(workbench())) },
    },
  );
}

function coldWorkbench(): WorkbenchSnapshot {
  return snapshot([
    action({
      id: 'collect_evidence',
      kind: 'research',
      title: 'ثبت یک تجربه واقعی',
      evidenceState: 'insufficient',
      evidenceIds: [],
      evidenceCount: 0,
      confidence: 0.3,
      rank: 1,
    }),
  ], 'insufficient', 0);
}

function groundedWorkbench(): WorkbenchSnapshot {
  return snapshot([
    action({
      id: 'essay',
      kind: 'content',
      title: 'یادداشت تحلیلی',
      evidenceState: 'grounded',
      evidenceIds: ['evidence-1'],
      evidenceCount: 1,
      confidence: 0.8,
      rank: 1,
    }),
  ], 'grounded', 1);
}

function snapshot(
  actions: readonly WorkbenchAction[],
  evidenceState: WorkbenchSnapshot['evidence']['state'],
  evidenceCount: number,
): WorkbenchSnapshot {
  return {
    policyVersion: 'strategic-decision-v1',
    generatedAt: now.toISOString(),
    runtime: { source: 'node_api', persistence: 'memory' },
    profile: { maturityPercent: evidenceCount ? 20 : 0, evidenceCount, openContradictions: 0 },
    goal: {
      id: 'goal-1', revision: evidenceCount ? 2 : 1, title: 'اعتماد', outcome: 'تعامل عمیق', successMetrics: ['کیفیت'],
    },
    attentionBudget: testAttentionBudget,
    decisionContext: {
      policyVersion: 'decision-context-v1', revision: 1, contextHash: 'a'.repeat(64),
      updatedAt: now.toISOString(), persistence: 'memory', attentionBudget: testAttentionBudget,
    },
    decisionFrame: testDecisionFrame(now),
    evidence: {
      state: evidenceState,
      strategyEvidenceCount: evidenceCount,
      withheldEvidenceCount: 0,
      sourceTypes: evidenceCount ? ['text_asset'] : [],
    },
    actions,
    workflow: { id: 'workbench_today', status: 'awaiting_approval', revision: 1 },
  };
}

function action(input: Readonly<{
  id: string;
  kind: WorkbenchAction['kind'];
  title: string;
  evidenceState: WorkbenchAction['evidenceState'];
  evidenceIds: readonly string[];
  evidenceCount: number;
  confidence: number;
  rank: number;
}>): WorkbenchAction {
  return {
    ...input,
    rationale: 'یک مسیر محدود و قابل‌بررسی.',
    benefits: ['وضوح'],
    risks: ['مزاحمت'],
    prerequisites: ['رضایت مالک'],
    riskLevel: 'low',
    attentionCostMinutes: 20,
    energyCost: 1,
    attentionDemand: 1,
    visibilityCost: 1,
    emotionalCost: 1,
    feasible: true,
    feasibilityReasons: ['within_budget'],
    utilityScore: 50,
    opportunityCost: 2,
    evidenceSourceTypes: input.evidenceCount ? ['text_asset'] : [],
    interaction: input.id === 'collect_evidence' ? 'open_intake' : 'approve',
    decision: testDecisionContract(input.kind, now),
  };
}

function arbitrationSnapshot(workbench: WorkbenchSnapshot): ArbitrationWorkspaceSnapshot {
  return {
    generatedAt: now.toISOString(),
    persistence: 'memory',
    policyVersion: 'intermodule-arbitration-v1',
    contractVersion: 'module-opinion-v1',
    autonomy: [
      { level: 0, key: 'observe', label: 'مشاهده' },
      { level: 1, key: 'analyze', label: 'تحلیل' },
      { level: 2, key: 'recommend', label: 'پیشنهاد' },
      { level: 3, key: 'draft', label: 'پیش‌نویس' },
      { level: 4, key: 'prepare_action', label: 'آماده‌سازی اقدام' },
      { level: 5, key: 'ask_approval', label: 'درخواست تأیید' },
      { level: 6, key: 'execute_delegated', label: 'اجرای واگذارشده' },
      { level: 7, key: 'bounded_automation', label: 'اتوماسیون محدود' },
    ],
    mvpExecutionEnabled: false,
    availableActions: workbench.actions.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      evidenceCount: item.evidenceCount,
      confidence: item.confidence,
      currentContextHash: `context-${item.id}`,
    })),
    cases: [],
  };
}
