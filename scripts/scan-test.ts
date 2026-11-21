// Photo input: scan a khata page and print what Artha read, the sections and every discrepancy it found.
//   npx tsx scripts/scan-test.ts [persona] [image]
import fs from 'node:fs';
import { handle } from '../server/handler.ts';
process.loadEnvFile('.env');
const p = process.argv[2] ?? 'imran', img = process.argv[3] ?? 'eval/images/khata-imran.jpg';
const call = async (path: string, body: unknown) => JSON.parse(String((await handle({ method: 'POST', path, query: new URLSearchParams(), headers: {}, body: Buffer.from(JSON.stringify(body)) })).body));
await call('/api/reset', { p });
const t = Date.now();
const r = await call('/api/scan', { p, image: `data:image/jpeg;base64,${fs.readFileSync(img).toString('base64')}` });
if (r.error) { console.log(r.error); process.exit(1); }
const { scan, result } = r;
console.log(`\n📷 ${scan.title} · ${scan.doc_type} · ${scan.date} · ${((Date.now() - t) / 1000).toFixed(1)}s`);
for (const l of scan.lines) console.log(`  ${String(l.n).padStart(2)}. ${l.kind.padEnd(9)} ${(l.party || '-').padEnd(16)} ${(l.item || '').padEnd(18)} ₹${l.amount}${l.confidence < 0.6 ? '  (unclear)' : ''}${l.contact_id ? `  [${l.contact_id}]` : ''}`);
console.log('\nSections:'); for (const s of scan.sections) console.log(`  ${s.label}: ₹${s.total} (lines ${s.lines.join(', ')})`);
console.log('\nChecks:'); for (const i of scan.issues) console.log(`  ${i.level === 'error' ? '❌' : i.level === 'warn' ? '⚠️ ' : 'ℹ️ '} ${i.title} — ${i.detail}`);
console.log(`\n${result.actions.length} khata entries proposed · 🔊 ${result.reply}`);
