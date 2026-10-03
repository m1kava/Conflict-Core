import { createReadStream, promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/**
 * Minimal static file server for the built client. Resolves paths inside the client directory only
 * (no traversal), falls back to index.html for the single-page app, long-caches hashed assets.
 */
export async function serveStatic(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const resolvedRoot = path.resolve(root);
  let file = path.resolve(resolvedRoot, '.' + pathname);
  if (!file.startsWith(resolvedRoot + path.sep) && file !== resolvedRoot) {
    response.writeHead(403).end();
    return;
  }
  let stat = await fs.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = await fs.stat(file).catch(() => null);
  }
  if (!stat) {
    if (path.extname(pathname)) {
      response.writeHead(404, SECURITY_HEADERS).end('Not found');
      return;
    }
    file = path.join(resolvedRoot, 'index.html');
    stat = await fs.stat(file).catch(() => null);
    if (!stat) {
      response.writeHead(503, { 'Content-Type': 'text/plain' }).end('Client not built. Run `npm run build`.');
      return;
    }
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}
