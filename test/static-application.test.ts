import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStaticRequestHandler } from '../src/http/static-application.js';

let root = '';
const servers: ReturnType<typeof createServer>[] = [];

beforeEach(async () => {
  root = join(tmpdir(), `pr-static-${crypto.randomUUID()}`);
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<title>PR preview</title>');
  await writeFile(join(root, 'assets', 'app.js'), 'globalThis.loaded = true;');
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  })));
  await rm(root, { recursive: true, force: true });
});

async function request(path: string, method = 'GET'): Promise<Response> {
  const handler = createStaticRequestHandler(root);
  const server = createServer((incoming, response) => {
    void handler(incoming, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return fetch(`http://127.0.0.1:${String(address.port)}${path}`, { method });
}

describe('static application handler', () => {
  it('serves the shell and immutable assets', async () => {
    const shell = await request('/');
    expect(shell.status).toBe(200);
    expect(shell.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(shell.headers.get('cache-control')).toBe('no-store');
    await expect(shell.text()).resolves.toContain('PR preview');

    const asset = await request('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
  });

  it('falls back to the SPA shell without exposing missing files', async () => {
    expect((await request('/learning')).status).toBe(200);
    expect((await request('/missing.js')).status).toBe(404);
    expect((await request('/..%2F..%2Fsecret')).status).toBe(404);
  });

  it('supports HEAD without a response body', async () => {
    const response = await request('/index.html', 'HEAD');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
