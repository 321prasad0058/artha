// AWS Lambda entry (Function URL, payload v2). Same routes as the local server; CloudFront sends /api/* here.
import { handle } from './handler.js';

// Browsers on these sites may call the API directly (the site is on Firebase, the API stays on CloudFront).
const ALLOWED = new Set(['https://artha-ai.web.app', 'https://artha-ai.firebaseapp.com', 'http://localhost:5173']);

export async function handler(event: any) {
  const origin = event.headers?.origin ?? event.headers?.Origin ?? '';
  const cors: Record<string, string> = ALLOWED.has(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
    : {};
  if (event.requestContext?.http?.method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0);
  const out = await handle({
    method: event.requestContext?.http?.method ?? 'GET',
    path: event.rawPath ?? '/',
    query: new URLSearchParams(event.rawQueryString ?? ''),
    headers: event.headers ?? {},
    body,
  });
  const binary = Buffer.isBuffer(out.body);
  return {
    statusCode: out.status,
    headers: { 'cache-control': 'no-store', ...(out.headers ?? {}), ...cors },
    body: binary ? (out.body as Buffer).toString('base64') : out.body,
    isBase64Encoded: binary,
  };
}
