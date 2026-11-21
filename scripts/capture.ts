// Captures full, real pipeline outputs (all three systems) for the demo clips, for the explainer page.
// Usage: npx tsx scripts/capture.ts <out.json>
import fs from 'node:fs';
import { transcribe } from '../server/openai.ts';
import { hintWords } from '../server/pipeline/candidates.ts';
import { understand } from '../server/pipeline/understand.ts';
import { freshState, persona, personas } from '../server/store.ts';
import type { Mode } from '../server/types.ts';

process.loadEnvFile('.env');
const out = process.argv[2] ?? 'capture.json';
const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's1', 's2', 's3', 'i1', 'i2', 'i6', 'm1', 'm2', 'm5'];
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const clips = JSON.parse(fs.readFileSync('eval/clips.json', 'utf8'));

async function one(id: string) {
  const c = cases.find((x: any) => x.id === id); const clip = clips.find((x: any) => x.id === id);
  const p = persona(c.persona);
  const audio = fs.readFileSync(`web/public/clips/${clip.file}`);
  const hints = `A short WhatsApp-style voice note from India, may mix Hindi, Marathi, Telugu, Tamil, Urdu and English. Names that may come up: ${hintWords(p).join(', ')}.`;
  let t = Date.now(); const heardBase = await transcribe(audio, 'audio/mpeg'); const baseMs = Date.now() - t;
  t = Date.now(); const heardArtha = await transcribe(audio, 'audio/mpeg', hints); const arthaMs = Date.now() - t;
  const res: Record<string, any> = {};
  for (const [mode, heard] of [['base', heardBase], ['base_ctx', heardBase], ['artha', heardArtha]] as [Mode, string][]) {
    res[mode] = await understand({ persona: p, state: freshState(p), transcript: heard, mode });
  }
  console.log(id, '✓');
  return { id, persona: c.persona, lang: c.lang, label: c.label, text: c.text, file: clip.file, synthetic: clip.synthetic, expect: c.expect, heard: { base: heardBase, artha: heardArtha }, hearMs: { base: baseMs, artha: arthaMs }, ...res };
}
const all = [];
for (let i = 0; i < ids.length; i += 4) all.push(...(await Promise.all(ids.slice(i, i + 4).map(one))));
const ps = personas().map(p => ({ ...p, state: freshState(p) }));
fs.writeFileSync(out, JSON.stringify({ capturedAt: new Date().toISOString(), notes: all, personas: ps, results: JSON.parse(fs.readFileSync('eval/results.json', 'utf8')) }));
console.log('wrote', out);
