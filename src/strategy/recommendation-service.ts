import type { TenantId, UserId } from '../kernel/identity.js';
import type {
  DataClass,
  PermissionGrant,
} from '../kernel/policy.js';
import type { Assertion } from '../memory/personal-memory.js';
import { retrieveAssertions } from '../memory/retrieval.js';
import type {
  InMemoryCostLedger,
  WorkflowCost,
} from '../observability/cost-ledger.js';
import type { ModelGateway, ModelUsage } from '../providers/model-gateway.js';
import {
  createWorkflow,
  evolveWorkflow,
  type WorkflowState,
} from '../workflow/workflow.js';
import {
  rankStrategicOptions,
  validateGoal,
  type AttentionBudget,
  type Goal,
  type RankedOption,
  type RankingPolicy,
  type StrategicOption,
} from './strategy.js';

export type RecommendationRequest = Readonly<{
  requestId: string;
  workflowId: string;
  tenantId: TenantId;
  actorId: UserId;
  goal: Goal;
  dataClass: DataClass;
  externalProcessingApproved: boolean;
  at: Date;
  attentionBudget: AttentionBudget;
  rankingPolicy: RankingPolicy;
}>;

export type PreparedRecommendation = Readonly<{
  requestId: string;
  workflow: WorkflowState;
  goal: Goal;
  rankedOptions: readonly RankedOption[];
  evidenceAssertionIds: readonly string[];
  modelUsage: ModelUsage;
  workflowCost: WorkflowCost;
}>;

export class RecommendationPermissionError extends Error {
  public constructor(public readonly reason: string) {
    super(`Recommendation memory access denied: ${reason}`);
  }
}

export async function prepareRecommendation(
  request: RecommendationRequest,
  dependencies: Readonly<{
    grants: readonly PermissionGrant[];
    assertions: readonly Assertion[];
    modelGateway: ModelGateway;
    costLedger: InMemoryCostLedger;
  }>,
): Promise<PreparedRecommendation> {
  if (request.goal.tenantId !== request.tenantId) {
    throw new Error('Goal and recommendation tenant must match.');
  }
  const goal = validateGoal(request.goal);
  const memory = retrieveAssertions(
    {
      tenantId: request.tenantId,
      actorId: request.actorId,
      purpose: 'strategy_reasoning',
      dataClass: request.dataClass,
      at: request.at,
      limit: 50,
    },
    dependencies.grants,
    dependencies.assertions,
  );
  if (!memory.allowed) throw new RecommendationPermissionError(memory.reason);

  const modelResult = await dependencies.modelGateway.generateStructured<
    Readonly<{ goal: Goal; memory: readonly Assertion[] }>,
    Readonly<{ options: readonly StrategicOption[] }>
  >({
    requestId: request.requestId,
    workflowId: request.workflowId,
    invocationId: request.requestId,
    tenantId: request.tenantId,
    actorId: request.actorId,
    purpose: 'strategy_options',
    input: { goal, memory: memory.assertions },
    dataClasses: [request.dataClass],
    externalProcessingApproved: request.externalProcessingApproved,
    schemaName: 'strategic-options-v1',
    maxOutputTokens: 4_000,
    at: request.at,
  });

  dependencies.costLedger.record({
    workflowId: request.workflowId,
    invocationId: request.requestId,
    provider: modelResult.usage.provider,
    model: modelResult.usage.model,
    inputTokens: modelResult.usage.inputTokens,
    outputTokens: modelResult.usage.outputTokens,
    cachedInputTokens: modelResult.usage.cachedInputTokens,
    costMinorUnits: modelResult.usage.costMinorUnits,
  });

  const rankedOptions = rankStrategicOptions(
    request.tenantId,
    modelResult.output.options,
    request.attentionBudget,
    request.rankingPolicy,
  );
  const workflow = evolveWorkflow(createWorkflow(request.workflowId), {
    id: `${request.requestId}:approval-requested`,
    type: 'approval_requested',
  });

  return {
    requestId: request.requestId,
    workflow,
    goal,
    rankedOptions,
    evidenceAssertionIds: memory.assertions.map((assertion) => assertion.id),
    modelUsage: modelResult.usage,
    workflowCost: dependencies.costLedger.forWorkflow(request.workflowId),
  };
}
