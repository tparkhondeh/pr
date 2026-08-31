import { createServer } from 'node:http';
import { loadEnvironment } from './config/environment.js';
import { createRequestHandler } from './http/application.js';

const environment = loadEnvironment();

const requestHandler = createRequestHandler(() => ({ ready: true }));
const server = createServer((request, response) => {
  void requestHandler(request, response);
});

server.listen(environment.port, () => {
  process.stdout.write(
    `PR foundation listening on :${String(environment.port)}\n`,
  );
});
