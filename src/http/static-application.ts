import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export type StaticRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<boolean>;

export function createStaticRequestHandler(root: string): StaticRequestHandler {
  const absoluteRoot = resolve(root);
  const rootPrefix = `${absoluteRoot}${sep}`;

  return async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;

    const pathname = request.url
      ? new URL(request.url, 'http://localhost').pathname
      : '/';
    const decodedPath = safeDecode(pathname);
    if (decodedPath === undefined || decodedPath.includes('\0')) return false;

    const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
    const candidate = resolve(absoluteRoot, `.${requestedPath}`);
    if (candidate !== absoluteRoot && !candidate.startsWith(rootPrefix)) return false;

    const direct = await readableFile(candidate);
    const filePath = direct
      ? candidate
      : extname(requestedPath) === ''
        ? resolve(absoluteRoot, 'index.html')
        : undefined;
    if (!filePath || !(await readableFile(filePath))) return false;

    response.writeHead(200, {
      'cache-control': filePath.endsWith('index.html')
        ? 'no-store'
        : 'public, max-age=31536000, immutable',
      'content-type': contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return true;
    }
    createReadStream(filePath).pipe(response);
    return true;
  };
}

async function readableFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
