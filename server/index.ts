// Local server: the API on :8787 (Vite proxies /api to it in development) and the built app from dist/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handle, speakFor } from './handler.js';

try { process.loadEnvFile('.env'); } catch { /* use the real environment */ }
const PORT = Number(process.env.PORT || 8787);
const DIST = path.resolve('dist');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/speak' && req.method === 'GET') {   // streamed reply, as on Lambda
    const v = await speakFor(url.searchParams.get('p') ?? '', url.searchParams.get('text') ?? '').catch(e => ({ error: String(e.message) }));
    if ('error' in v) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify(v)); }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' });
    if (v.cached) return res.end(v.cached);
    const parts: Buffer[] = [];
    for await (const c of v.stream as any) { const b = Buffer.from(c); parts.push(b); res.write(b); }
    res.end(); v.done!(Buffer.concat(parts)); return;
  }
  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const out = await handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers as Record<string, string>, body: Buffer.concat(chunks) });
    res.writeHead(out.status, out.headers);
    return res.end(out.body);
  }
  // serve the built app (production-like local run)
  let file = path.join(DIST, path.normalize(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Run "npm run build" first, or use "npm run dev".'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Artha API on http://localhost:${PORT}`));
