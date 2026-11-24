// Local server: the API on :8787 (Vite proxies /api to it in development) and the built app from dist/.
import http from 'node:http';
import path from 'node:path';
import { serve } from './http.js';

try { process.loadEnvFile('.env'); } catch { /* use the real environment */ }
const PORT = Number(process.env.PORT || 8787);
const DIST = path.resolve('dist');

http.createServer((req, res) => { serve(req, res, DIST).catch(e => { if (!res.headersSent) res.writeHead(500); res.end(String(e?.message ?? e)); }); })
  .listen(PORT, () => console.log(`Artha API on http://localhost:${PORT}`));
