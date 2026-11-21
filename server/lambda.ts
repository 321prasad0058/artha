// AWS Lambda entry (Function URL in RESPONSE_STREAM mode). Same routes as the local server; CloudFront sends /api/* here.
// Streaming lets Artha's spoken reply start playing while it is still being generated.
import { STREAMS, handle, speakFor } from './handler.js';

declare const awslambda: any;

// Browsers on these sites may call the API directly (local development).
const ALLOWED = new Set(['http://localhost:5173']);

export const handler = awslambda.streamifyResponse(async (event: any, responseStream: any) => {
  // the 5-minute warm-up ping (EventBridge): keeps one instance ready so a note never pays a cold start
  if (event?.warm) { responseStream.end(); return; }
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '/';
  const origin = event.headers?.origin ?? '';
  const cors: Record<string, string> = ALLOWED.has(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', vary: 'origin' } : {};
  const open = (statusCode: number, headers: Record<string, string>) => awslambda.HttpResponseStream.from(responseStream, { statusCode, headers: { 'cache-control': 'no-store', ...headers, ...cors } });
  const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0);
  try {
    if (method === 'OPTIONS') { open(204, {}).end(); return; }
    // the spoken reply, streamed: GET /api/speak?p=&text=  (an <audio> element plays it as it arrives)
    if (path === '/api/speak' && method === 'GET') {
      const q = new URLSearchParams(event.rawQueryString ?? '');
      const v = await speakFor(q.get('p') ?? '', q.get('text') ?? '');
      if ('error' in v) { const s = open(400, { 'content-type': 'application/json' }); s.write(JSON.stringify({ error: v.error })); s.end(); return; }
      const s = open(200, { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' });
      if (v.cached) { s.write(v.cached); s.end(); return; }
      const parts: Buffer[] = [];
      for await (const c of v.stream as any) { const b = Buffer.from(c); parts.push(b); s.write(b); }
      s.end(); v.done!(Buffer.concat(parts));
      return;
    }
    // a whole note, streamed as newline-delimited JSON events
    if (STREAMS[path] && method === 'POST') {
      const s = open(200, { 'content-type': 'application/x-ndjson' });
      try { for await (const e of STREAMS[path]({ method, path, query: new URLSearchParams(event.rawQueryString ?? ''), headers: event.headers ?? {}, body })) s.write(JSON.stringify(e) + '\n'); }
      catch (e: any) { s.write(JSON.stringify({ t: 'error', error: e?.message ?? 'Server error' }) + '\n'); }
      s.end(); return;
    }
    const out = await handle({ method, path, query: new URLSearchParams(event.rawQueryString ?? ''), headers: event.headers ?? {}, body });
    const s = open(out.status, out.headers ?? {});
    s.write(out.body); s.end();
  } catch (e: any) {
    const s = open(500, { 'content-type': 'application/json' }); s.write(JSON.stringify({ error: e?.message ?? 'Server error' })); s.end();
  }
});
