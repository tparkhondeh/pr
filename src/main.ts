import { createServer } from 'node:http';
import {
  DecisionArbitrationService,
  InMemoryArbitrationRepository,
  PostgresArbitrationRepository,
} from './arbitration/decision-arbitration.js';
import {
  AuditTrailService,
  InMemoryAuditTrailRepository,
  PostgresAuditTrailRepository,
} from './account/audit-trail.js';
import {
  InMemoryTextAssetRepository,
  PostgresTextAssetRepository,
  TextAssetIntakeService,
} from './assets/text-asset-intake.js';
import { loadEnvironment } from './config/environment.js';
import {
  ContentDraftService,
  InMemoryDraftWorkspaceRepository,
  PostgresDraftWorkspaceRepository,
} from './claims/workspace.js';
import {
  ClaimGovernanceService,
  InMemoryClaimGovernanceRepository,
  PostgresClaimGovernanceRepository,
} from './claims/governance.js';
import { ConversationIntakeService } from './conversation/intake.js';
import { PostgresConversationMemoryRepository } from './conversation/repository.js';
import { PostgresRuntime } from './database/postgres.js';
import { PostgresStrategicQualityRepository } from './database/postgres-strategic-quality.js';
import { PostgresWorkflowCostRepository } from './database/postgres-workflow-cost.js';
import { PostgresModelInvocationJournalRepository } from './database/postgres-model-invocation-journal.js';
import {
  InMemoryStrategicQualityRepository,
  StrategicQualityService,
} from './evaluation/strategic-quality.js';
import {
  FeedbackLearningService,
  InMemoryFeedbackLearningRepository,
  PostgresFeedbackLearningRepository,
} from './feedback/workspace.js';
import { AuthenticExpressionService } from './expression/authentic-expression.js';
import {
  InMemoryInitiativeRepository,
  InitiativePolicyService,
  PostgresInitiativeRepository,
} from './initiative/initiative-policy.js';
import { createRequestHandler } from './http/application.js';
import { createStaticRequestHandler } from './http/static-application.js';
import { tenantId, userId } from './kernel/identity.js';
import {
  InMemoryWorkflowCostRepository,
  WorkflowCostControlService,
} from './observability/workflow-cost-control.js';
import {
  defaultPromptModelRegistry,
  ModelGovernanceService,
} from './providers/model-governance.js';
import {
  InMemoryModelInvocationJournalRepository,
  ModelInvocationJournalService,
} from './providers/model-invocation-journal.js';
import { ModelInputSafetyService } from './providers/model-input-safety.js';
import { ModelInvocationReconciliationService } from './providers/model-invocation-reconciliation.js';
import {
  InMemoryPerceptionWorkspaceRepository,
  PerceptionWorkspaceService,
  PostgresPerceptionWorkspaceRepository,
} from './perception/workspace.js';
import { OpportunityRadarService } from './opportunities/radar.js';
import {
  InMemoryResearchWorkspaceRepository,
  PostgresResearchWorkspaceRepository,
  ResearchWorkspaceService,
} from './research/workspace.js';
import {
  InMemoryRelationshipWorkspaceRepository,
  PostgresRelationshipWorkspaceRepository,
  RelationshipWorkspaceService,
} from './relationships/workspace.js';
import {
  BrandProtectionService,
  InMemoryRiskReviewRepository,
  PostgresRiskReviewRepository,
} from './risk/brand-protection.js';
import {
  InMemoryStrategyContextRepository,
  PostgresStrategyContextRepository,
  StrategyContextService,
  defaultStrategyContext,
} from './strategy/context.js';
import {
  DecisionContextService,
  InMemoryDecisionContextRepository,
  PostgresDecisionContextRepository,
  defaultDecisionContext,
} from './strategy/decision-context.js';
import {
  InMemoryWorkbenchApprovalRepository,
  PostgresWorkbenchApprovalRepository,
} from './workbench/approval-repository.js';
import { OwnerEvidenceContextService } from './workbench/evidence-context.js';
import { createDefaultWorkbenchService } from './workbench/workbench.js';

const environment = loadEnvironment();
const postgres = environment.database
  ? new PostgresRuntime(environment.database.connectionString)
  : undefined;
const approvalRepository = postgres && environment.database
  ? new PostgresWorkbenchApprovalRepository(postgres, {
      tenantId: environment.database.tenantId,
      ownerUserId: environment.database.ownerUserId,
      workflowId: 'workbench_today',
    })
  : new InMemoryWorkbenchApprovalRepository();
const conversationRepository = postgres && environment.database
  ? new PostgresConversationMemoryRepository(postgres, {
      tenantId: environment.database.tenantId,
      ownerUserId: environment.database.ownerUserId,
    })
  : undefined;
const ownerUserId = environment.database?.ownerUserId ?? 'owner_primary';
const activeTenantId = environment.database?.tenantId ?? 'tenant_primary';
const activeTenant = tenantId(activeTenantId);
const owner = userId(ownerUserId);
const auditTrail = new AuditTrailService(
  postgres && environment.database
    ? new PostgresAuditTrailRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryAuditTrailRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const assets = new TextAssetIntakeService(
  postgres && environment.database
    ? new PostgresTextAssetRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryTextAssetRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const fallbackStrategy = defaultStrategyContext(activeTenant, owner);
const strategyRepository = postgres && environment.database
  ? new PostgresStrategyContextRepository(
      postgres,
      {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
        workflowId: 'workbench_today',
      },
      fallbackStrategy,
    )
  : new InMemoryStrategyContextRepository(fallbackStrategy, approvalRepository);
const strategy = new StrategyContextService(strategyRepository, {
  tenantId: activeTenant,
  ownerUserId: owner,
});
const fallbackDecisionContext = defaultDecisionContext();
const decisionContextRepository = postgres && environment.database
  ? new PostgresDecisionContextRepository(
      postgres,
      {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
        workflowId: 'workbench_today',
      },
      fallbackDecisionContext,
    )
  : new InMemoryDecisionContextRepository(fallbackDecisionContext, approvalRepository);
const decisionContext = new DecisionContextService(decisionContextRepository, {
  tenantId: activeTenant,
  ownerUserId: owner,
});
const conversation = new ConversationIntakeService(conversationRepository);
const evidenceContext = new OwnerEvidenceContextService(
  assets,
  conversation,
  { tenantId: activeTenant, ownerUserId: owner },
);

const workbench = createDefaultWorkbenchService(
  () => new Date(),
  approvalRepository,
  { tenantId: activeTenantId, ownerUserId },
  strategy,
  evidenceContext,
  decisionContext,
);
const draftRepository = postgres && environment.database
  ? new PostgresDraftWorkspaceRepository(postgres, {
      tenantId: environment.database.tenantId,
      ownerUserId: environment.database.ownerUserId,
    })
  : new InMemoryDraftWorkspaceRepository();
const learningRepository = postgres && environment.database
  ? new PostgresFeedbackLearningRepository(postgres, {
      tenantId: environment.database.tenantId,
      ownerUserId: environment.database.ownerUserId,
    })
  : new InMemoryFeedbackLearningRepository();
const learning = new FeedbackLearningService(learningRepository, {
  tenantId: activeTenant,
  ownerUserId: owner,
});
const strategicQuality = new StrategicQualityService(
  postgres && environment.database
    ? new PostgresStrategicQualityRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryStrategicQualityRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
  workbench,
);
const workflowCosts = new WorkflowCostControlService(
  postgres && environment.database
    ? new PostgresWorkflowCostRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryWorkflowCostRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const modelInvocationJournal = new ModelInvocationJournalService(
  postgres && environment.database
    ? new PostgresModelInvocationJournalRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryModelInvocationJournalRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const modelInputSafety = new ModelInputSafetyService();
const modelInvocationReconciliation = new ModelInvocationReconciliationService(
  modelInvocationJournal,
  workflowCosts,
  { tenantId: activeTenant, ownerUserId: owner },
);
const modelGovernance = new ModelGovernanceService(
  defaultPromptModelRegistry,
  { tenantId: activeTenant, ownerUserId: owner },
  false,
  modelInvocationJournal,
  modelInputSafety,
  modelInvocationReconciliation,
);
const expression = new AuthenticExpressionService(
  { tenantId: activeTenant, ownerUserId: owner },
  assets,
  learning,
);
const research = new ResearchWorkspaceService(
  postgres && environment.database
    ? new PostgresResearchWorkspaceRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryResearchWorkspaceRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const opportunities = new OpportunityRadarService(
  { tenantId: activeTenant, ownerUserId: owner },
  research,
  strategy,
);
const claimRepository = postgres && environment.database
  ? new PostgresClaimGovernanceRepository(postgres, {
      tenantId: environment.database.tenantId,
      ownerUserId: environment.database.ownerUserId,
    })
  : new InMemoryClaimGovernanceRepository();
const drafts = new ContentDraftService(
  draftRepository,
  { tenantId: activeTenant, ownerUserId: owner },
  conversation,
  workbench,
  strategy,
  learning,
  assets,
  claimRepository,
);
const claims = new ClaimGovernanceService(
  claimRepository,
  { tenantId: activeTenant, ownerUserId: owner },
  { drafts, research },
);
const risk = new BrandProtectionService(
  postgres && environment.database
    ? new PostgresRiskReviewRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryRiskReviewRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const arbitration = new DecisionArbitrationService(
  postgres && environment.database
    ? new PostgresArbitrationRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryArbitrationRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
  { workbench, risk, claims },
);
const initiative = new InitiativePolicyService(
  postgres && environment.database
    ? new PostgresInitiativeRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryInitiativeRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
  { workbench, arbitration },
);
const relationships = new RelationshipWorkspaceService(
  postgres && environment.database
    ? new PostgresRelationshipWorkspaceRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryRelationshipWorkspaceRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const perception = new PerceptionWorkspaceService(
  postgres && environment.database
    ? new PostgresPerceptionWorkspaceRepository(postgres, {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      })
    : new InMemoryPerceptionWorkspaceRepository(),
  { tenantId: activeTenant, ownerUserId: owner },
);
const requestHandler = createRequestHandler(
  async () => ({
    ...(postgres ? await postgres.readiness() : { ready: true }),
    persistence: environment.runtime.persistence,
    durability: environment.runtime.durability,
  }),
  {
    workbench,
    strategy,
    decisionContext,
    drafts,
    learning,
    strategicQuality,
    workflowCosts,
    modelGovernance,
    modelInvocationReconciliation,
    conversation,
    auditTrail,
    assets,
    research,
    claims,
    risk,
    arbitration,
    initiative,
    relationships,
    perception,
    expression,
    opportunities,
    ...(!postgres ? { mutationAuditTrail: auditTrail } : {}),
    tenantId: activeTenant,
    // Single-owner bootstrap identity. Replace with verified SIWC/session identity
    // before allowing any multi-user or public deployment.
    resolveActor: () => owner,
  },
);
const staticRequestHandler = environment.staticRoot
  ? createStaticRequestHandler(environment.staticRoot)
  : undefined;
const server = createServer((request, response) => {
  const path = request.url ? new URL(request.url, 'http://localhost').pathname : '/';
  const isApplicationRequest = path === '/health' || path === '/ready' || path.startsWith('/api/');
  if (!staticRequestHandler || isApplicationRequest) {
    void requestHandler(request, response);
    return;
  }
  void staticRequestHandler(request, response).then((handled) => {
    if (!handled) void requestHandler(request, response);
  });
});

server.listen(environment.port, environment.bindHost, () => {
  process.stdout.write(
    `PR foundation listening on ${environment.bindHost}:${String(environment.port)} ` +
      `persistence=${environment.runtime.persistence} ` +
      `durability=${environment.runtime.durability}\n`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void postgres?.close().finally(() => process.exit(0));
      if (!postgres) process.exit(0);
    });
  });
}
