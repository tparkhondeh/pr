import { createServer } from 'node:http';
import { loadEnvironment } from './config/environment.js';
import {
  ContentDraftService,
  InMemoryDraftWorkspaceRepository,
  PostgresDraftWorkspaceRepository,
} from './claims/workspace.js';
import { ConversationIntakeService } from './conversation/intake.js';
import { PostgresConversationMemoryRepository } from './conversation/repository.js';
import { PostgresRuntime } from './database/postgres.js';
import {
  FeedbackLearningService,
  InMemoryFeedbackLearningRepository,
  PostgresFeedbackLearningRepository,
} from './feedback/workspace.js';
import { createRequestHandler } from './http/application.js';
import { createStaticRequestHandler } from './http/static-application.js';
import { tenantId, userId } from './kernel/identity.js';
import {
  InMemoryStrategyContextRepository,
  PostgresStrategyContextRepository,
  StrategyContextService,
  defaultStrategyContext,
} from './strategy/context.js';
import {
  InMemoryWorkbenchApprovalRepository,
  PostgresWorkbenchApprovalRepository,
} from './workbench/approval-repository.js';
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

const workbench = createDefaultWorkbenchService(
  () => new Date(),
  approvalRepository,
  { tenantId: activeTenantId, ownerUserId },
  strategy,
);
const conversation = new ConversationIntakeService(conversationRepository);
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
const drafts = new ContentDraftService(
  draftRepository,
  { tenantId: activeTenant, ownerUserId: owner },
  conversation,
  workbench,
  strategy,
  learning,
);
const requestHandler = createRequestHandler(
  () => postgres?.readiness() ?? { ready: true },
  {
    workbench,
    strategy,
    drafts,
    learning,
    conversation,
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

server.listen(environment.port, () => {
  process.stdout.write(
    `PR foundation listening on :${String(environment.port)}\n`,
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
