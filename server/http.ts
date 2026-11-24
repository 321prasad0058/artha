// One request handler for every Node host: the local server (server/index.ts) and the Firebase function (server/firebase.ts).
// API routes go to handler.ts; anything else is the built app from `dist` (when given).
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { STREAMS, handle, speakFor } from './handler.js';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

/** The request body. Firebase has already read it into `rawBody`; a plain Node server still has to. */
async function bodyOf(req: IncomingMessage): Promise<Buffer> {
  const raw = (req as any).rawBody;
  if (raw) return Buffer.from(raw);
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Websites allowed to call this API from another address (the app on Firebase Hosting calls the API on Render). */
const ALLOWED = (process.env.ARTHA_ALLOWED_ORIGINS || 'https://heyartha.web.app,https://getartha.web.app')
  .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

export async function serve(req: IncomingMessage, res: ServerResponse, dist?: string) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const from = String(req.headers.origin ?? '');
  if (url.pathname.startsWith('/api/') && (ALLOWED.includes(from) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(from))) {
    res.setHeader('access-control-allow-origin', from);
    res.setHeader('vary', 'origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
      return res.end();
    }
  }
  if (url.pathname === '/api/speak' && req.method === 'GET') {   // streamed reply
    const v = await speakFor(url.searchParams.get('p') ?? '', url.searchParams.get('text') ?? '').catch(e => ({ error: String(e.message) }));
    if ('error' in v) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify(v)); }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' });
    if (v.cached) return res.end(v.cached);
    const parts: Buffer[] = [];
    for await (const c of v.stream as any) { const b = Buffer.from(c); parts.push(b); res.write(b); }
    res.end(); v.done!(Buffer.concat(parts)); return;
  }
  if (STREAMS[url.pathname] && req.method === 'POST') {   // streamed routes (a note, a Gmail sync)
    const body = await bodyOf(req);
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
    try { for await (const e of STREAMS[url.pathname]({ method: 'POST', path: url.pathname, query: url.searchParams, headers: req.headers as Record<string, string>, body })) res.write(JSON.stringify(e) + '\n'); }
    catch (e: any) { res.write(JSON.stringify({ t: 'error', error: e?.message ?? 'Server error' }) + '\n'); }
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) {
    const out = await handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers as Record<string, string>, body: await bodyOf(req) });
    res.writeHead(out.status, out.headers);   // includes redirects (Gmail sign-in)
    return res.end(out.body);
  }
  if (!dist) { res.writeHead(404); return res.end('Not found'); }
  // serve the built app (production-like local run)
  let file = path.join(dist, path.normalize(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Run "npm run build" first, or use "npm run dev".'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
