import type { TenantId, UserId } from '../kernel/identity.js';
import {
  decidePolicy,
  type DataClass,
  type PermissionGrant,
} from '../kernel/policy.js';
import type { InMemoryCostLedger, WorkflowCost } from '../observability/cost-ledger.js';
import type { ModelGateway, ModelUsage } from '../providers/model-gateway.js';
import type { RankedOption } from '../strategy/strategy.js';
import {
  createWorkflow,
  evolveWorkflow,
  type WorkflowState,
} from '../workflow/workflow.js';
import type { Claim } from './claim-registry.js';
import {
  guardDraft,
  type DraftArtifact,
  type DraftClaimReference,
  type DraftGuardResult,
} from './draft-guard.js';

export type DraftRequest = Readonly<{
  requestId: string;
  workflowId: string;
  draftId: string;
  tenantId: TenantId;
  actorId: UserId;
  channel: string;
  dataClass: DataClass;
  selectedOption: RankedOption;
  at: Date;
}>;

export type PreparedDraft = Readonly<{
  draft: DraftArtifact;
  guard: DraftGuardResult;
  workflow: WorkflowState;
  modelUsage: ModelUsage;
  workflowCost: WorkflowCost;
}>;

export class DraftPermissionError extends Error {
  public constructor(public readonly reason: string) {
    super(`Draft generation denied: ${reason}`);
  }
}

export async function prepareDraft(
  request: DraftRequest,
  dependencies: Readonly<{
    grants: readonly PermissionGrant[];
    claims: readonly Claim[];
    modelGateway: ModelGateway;
    costLedger: InMemoryCostLedger;
  }>,
): Promise<PreparedDraft> {
  if (request.selectedOption.tenantId !== request.tenantId) {
    throw new Error('Selected option belongs to another tenant.');
  }
  if (request.selectedOption.kind !== 'content') {
    throw new Error('Only content actions can enter the draft pipeline.');
  }
  const permission = decidePolicy(
    {
      tenantId: request.tenantId,
      actorId: request.actorId,
      purpose: 'public_drafting',
      operation: 'derive',
      dataClass: request.dataClass,
    },
    dependencies.grants,
    request.at,
  );
  if (!permission.allowed) throw new DraftPermissionError(permission.reason);

  const usableClaims = dependencies.claims.filter(
    (claim) =>
      claim.tenantId === request.tenantId &&
      claim.dataClass === request.dataClass &&
      claim.allowedPurposes.includes('public_drafting') &&
      claim.allowedChannels.includes(request.channel),
  );
  const modelResult = await dependencies.modelGateway.generateStructured<
    Readonly<{ option: RankedOption; claims: readonly Claim[]; channel: string }>,
    Readonly<{
      body: string;
      claims: readonly DraftClaimReference[];
      claimExtractionComplete: boolean;
    }>
  >({
    requestId: request.requestId,
    tenantId: request.tenantId,
    purpose: 'draft_content',
    input: {
      option: request.selectedOption,
      claims: usableClaims,
      channel: request.channel,
    },
    dataClasses: [request.dataClass],
    schemaName: 'evidence-bound-draft-v1',
    maxOutputTokens: 3_000,
  });

  dependencies.costLedger.record({
    workflowId: request.workflowId,
    invocationId: request.requestId,
    provider: modelResult.usage.provider,
    model: modelResult.usage.model,
    inputTokens: modelResult.usage.inputTokens,
    outputTokens: modelResult.usage.outputTokens,
    cachedInputTokens: modelResult.usage.cachedInputTokens,
    costMinorUnits: modelResult.usage.estimatedCostMinorUnits ?? 0,
  });

  const draft: DraftArtifact = {
    id: request.draftId,
    tenantId: request.tenantId,
    channel: request.channel,
    purpose: 'public_drafting',
    body: modelResult.output.body,
    claimExtractionComplete: modelResult.output.claimExtractionComplete,
    claims: modelResult.output.claims,
  };
  const guard = guardDraft(draft, dependencies.claims, request.at);
  let workflow = createWorkflow(request.workflowId);
  if (guard.mayRequestApproval) {
    workflow = evolveWorkflow(workflow, {
      id: `${request.requestId}:approval-requested`,
      type: 'approval_requested',
    });
  }

  return {
    draft,
    guard,
    workflow,
    modelUsage: modelResult.usage,
    workflowCost: dependencies.costLedger.forWorkflow(request.workflowId),
  };
}

