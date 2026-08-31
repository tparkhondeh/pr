import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequestHandler } from '../src/http/application.js';

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
) {
  const handler = createRequestHandler(readinessCheck);
  const server = createServer((incomingRequest, response) => {
    void handler(incomingRequest, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return fetch(`http://127.0.0.1:${String(address.port)}${path}`);
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
});
