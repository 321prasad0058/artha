// Makes the synthetic test clips (OpenAI text-to-speech) for every case that has no recording yet.
// Real recordings dropped into web/public/clips/<id>.webm|m4a|mp3 are used instead and marked not synthetic.
import fs from 'node:fs';
import path from 'node:path';
import { speech } from '../server/openai.ts';

process.loadEnvFile('.env');
const DIR = 'web/public/clips';
fs.mkdirSync(DIR, { recursive: true });
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const VOICE: Record<string, [string, string]> = {
  aditya: ['ash', 'a man in his late twenties from Hyderabad, quick and casual, Indian accent'],
  sunita: ['sage', 'a Marathi woman in her fifties from Pune, warm, natural Marathi pronunciation'],
  imran: ['onyx', 'a shopkeeper in his late thirties from Lucknow, Hindi-Urdu, busy and direct'],
  meenakshi: ['shimmer', 'a retired Tamil teacher in her sixties from Chennai, gentle, Tamil pronunciation'],
};
const index: any[] = [];
for (const c of cases) {
  const real = ['webm', 'm4a', 'mp3', 'wav'].map(e => `${c.id}.rec.${e}`).find(f => fs.existsSync(path.join(DIR, f)));
  const file = real ?? `${c.id}.mp3`;
  if (!real && !fs.existsSync(path.join(DIR, file))) {
    const [voice, who] = VOICE[c.persona];
    const buf = await speech(c.text, voice, `Speak as ${who}, leaving a short WhatsApp voice note in ${c.lang}. Natural pace, everyday speech, not a newsreader.`);
    fs.writeFileSync(path.join(DIR, file), buf);
    console.log('made', file);
  }
  index.push({ id: c.id, persona: c.persona, text: c.text, lang: c.lang, label: c.label, file, synthetic: !real, sample: !!c.sample });
}
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index.filter(x => x.sample), null, 1));
fs.writeFileSync('eval/clips.json', JSON.stringify(index, null, 1));
console.log(`${index.length} clips ready (${index.filter(x => !x.synthetic).length} real recordings)`);
