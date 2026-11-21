// Quick manual run: npx tsx scripts/try.ts <persona> "<transcript>" [mode]
import { understand } from '../server/pipeline/understand.ts';
import { loadState, persona } from '../server/store.ts';
process.loadEnvFile('.env');
const [pid = 'aditya', text = '', mode = 'artha'] = process.argv.slice(2);
const p = persona(pid); const state = await loadState(pid);
const t = Date.now();
const r = await understand({ persona: p, state, transcript: text, mode: mode as any });
console.log(`${mode} · ${Date.now() - t} ms · meaning ${r.ms.meaning}ms who ${r.ms.who}ms plan ${r.ms.plan}ms`);
console.log('roman:', r.roman); console.log('entities:', r.entities.map(e => `${e.text}=${e.label}`).join(' | '));
console.log('candidates:', r.candidates.map(c => `${c.name}:${c.score}`).join(', '));
console.log('mentions:', JSON.stringify(r.mentions.map(m => [m.text, m.kind, m.candidates.map(c => `${c.name}:${c.score}`)])));
console.log('clarify:', JSON.stringify(r.clarify)); console.log('actions:'); for (const a of r.actions) console.log('  -', a.type, a.contact_name || a.contact_id, '|', a.language, '|', a.text || a.title || a.goal, '|', a.when_label, a.amount_inr || '', a.predicted ? '(predicted)' : '', '| why:', a.why);
console.log('checks:', r.checks.map(c => (c.ok ? '✓ ' : '✗ ') + c.rule).join('; ')); console.log('learn:', r.learn); console.log('reply:', r.reply);
