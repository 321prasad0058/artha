// How natural are the clips? For each clip: transcribe it with NO hints and compare to the sentence that was meant
// (character error rate after converting both to Roman letters), and measure speaking pace.
// Usage: npx tsx scripts/voice-check.ts [clipDir]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { transcribe } from '../server/openai.ts';
import { romanize } from '../server/pipeline/translit.ts';

process.loadEnvFile('.env');
const dir = process.argv[2] ?? 'web/public/clips';
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const norm = (s: string) => romanize(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
function cer(ref: string, hyp: string) {
  const a = norm(ref), b = norm(hyp);
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length] / Math.max(1, a.length);
}
const rows: { id: string; cer: number; secs: number; wps: number; heard: string }[] = [];
await Promise.all(cases.map(async (c: any) => {
  const f = path.join(dir, `${c.id}.mp3`);
  if (!fs.existsSync(f)) return;
  const heard = await transcribe(fs.readFileSync(f), 'audio/mpeg');
  const secs = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  const words = (c.script ?? c.text).split(/\s+/).length;
  rows.push({ id: c.id, cer: cer(c.script ?? c.text, heard), secs, wps: words / secs, heard });
}));
rows.sort((a, b) => a.id.localeCompare(b.id));
for (const r of rows) console.log(`${r.id.padEnd(3)} error ${(r.cer * 100).toFixed(0).padStart(3)}%  ${r.secs.toFixed(1)}s  ${r.wps.toFixed(1)} words/s  ${r.heard}`);
const avg = (k: 'cer' | 'wps' | 'secs') => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(`\nAVERAGE  error ${(avg('cer') * 100).toFixed(1)}%  ·  ${avg('secs').toFixed(2)}s per clip  ·  ${avg('wps').toFixed(2)} words/s`);
