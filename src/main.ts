import { createServer } from 'node:http';
import { loadEnvironment } from './config/environment.js';
import { createRequestHandler } from './http/application.js';
import { userId } from './kernel/identity.js';
import { createDefaultWorkbenchService } from './workbench/workbench.js';

const environment = loadEnvironment();

const workbench = createDefaultWorkbenchService();
const requestHandler = createRequestHandler(
  () => ({ ready: true }),
  {
    workbench,
    // Single-owner bootstrap identity. Replace with verified SIWC/session identity
    // before allowing any multi-user or public deployment.
    resolveActor: () => userId('owner_primary'),
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
