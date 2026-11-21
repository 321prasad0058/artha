// AWS Lambda entry (Function URL, payload v2). Same routes as the local server; CloudFront sends /api/* here.
import { handle } from './handler.js';

export async function handler(event: any) {
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
    headers: { 'cache-control': 'no-store', ...(out.headers ?? {}) },
    body: binary ? (out.body as Buffer).toString('base64') : out.body,
    isBase64Encoded: binary,
  };
}
