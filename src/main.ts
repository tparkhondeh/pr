import { createServer } from 'node:http';
import { loadEnvironment } from './config/environment.js';

const environment = loadEnvironment();

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(environment.port, () => {
  process.stdout.write(
    `PR foundation listening on :${String(environment.port)}\n`,
  );
});
