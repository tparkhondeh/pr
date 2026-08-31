import { createServer } from 'node:http';
import { loadEnvironment } from './config/environment.js';
import { PostgresRuntime } from './database/postgres.js';
import { createRequestHandler } from './http/application.js';
import { userId } from './kernel/identity.js';
import { PostgresWorkbenchApprovalRepository } from './workbench/approval-repository.js';
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
  : undefined;
const ownerUserId = environment.database?.ownerUserId ?? 'owner_primary';

const workbench = createDefaultWorkbenchService(
  () => new Date(),
  approvalRepository,
  environment.database
    ? {
        tenantId: environment.database.tenantId,
        ownerUserId: environment.database.ownerUserId,
      }
    : undefined,
);
const requestHandler = createRequestHandler(
  () => postgres?.readiness() ?? { ready: true },
  {
    workbench,
    // Single-owner bootstrap identity. Replace with verified SIWC/session identity
    // before allowing any multi-user or public deployment.
    resolveActor: () => userId(ownerUserId),
  },
);
const server = createServer((request, response) => {
  void requestHandler(request, response);
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
