// Makes the synthetic test clips with OpenAI text-to-speech, tuned to sound like real Indian voice notes:
//  1. the sentence in its NATIVE script (अन्ना, అమ్మకి, செல்விக்கு), so names and words are pronounced natively,
//  2. a native-speaker direction per person (city, age, language, brisk WhatsApp pace),
//  3. silence trimmed and tempo raised 1.2x with pitch kept (ffmpeg atempo), because TTS reads too slowly.
// Real recordings dropped in as web/public/clips/<id>.rec.<ext> always win and are marked not synthetic.
// Usage: npx tsx scripts/make-clips.ts [--force] [ids]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.loadEnvFile('.env');
const DIR = 'web/public/clips';
const force = process.argv.includes('--force');
const only = process.argv.slice(2).find(a => !a.startsWith('--'))?.split(',');
fs.mkdirSync(DIR, { recursive: true });
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));

const VOICE: Record<string, { voice: string; who: Record<string, string> }> = {
  aditya: { voice: 'ash', who: { default: 'a 29-year-old man from Hyderabad who speaks Hindi and Hinglish like a native', Telugu: 'a 29-year-old man from Hyderabad, a native Telugu speaker' } },
  sunita: { voice: 'sage', who: { default: 'a 54-year-old woman from Pune, a native Marathi speaker' } },
  imran: { voice: 'onyx', who: { default: 'a 38-year-old shopkeeper from Lucknow who speaks Hindi and Urdu like a native' } },
  rohan: { voice: 'verse', who: { default: 'a 27-year-old man from Gurugram who speaks Hinglish like a native Delhi-NCR speaker' } },
  fatima: { voice: 'nova', who: { default: 'a 42-year-old woman from Hyderabad Old City who speaks Urdu and Dakhni Hindi like a native' } },
  gurpreet: { voice: 'echo', who: { default: 'a 51-year-old Sikh transporter from Ludhiana, a native Punjabi speaker' } },
  ananya: { voice: 'coral', who: { default: 'a 35-year-old schoolteacher from Kolkata who speaks Hindi with a light Bengali accent', Bengali: 'a 35-year-old woman from Kolkata, a native Bengali speaker' } },
  meenakshi: { voice: 'shimmer', who: { default: 'a 67-year-old retired teacher from Chennai, a native Tamil speaker', English: 'a 67-year-old retired teacher from Chennai speaking Indian English' } },
};
const TEMPO = 1.2;

async function speak(text: string, voice: string, instructions: string): Promise<Buffer> {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, instructions, response_format: 'wav' }),
  });
  if (!r.ok) throw new Error(`speech ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Trim silence at both ends and speed up without changing pitch. */
export function tighten(wav: Buffer, out: string) {
  const tmp = path.join(os.tmpdir(), `artha-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  fs.writeFileSync(tmp, wav);
  const af = `silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,atempo=${TEMPO}`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-af', af, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', out]);
  fs.unlinkSync(tmp);
}

const index: any[] = [];
for (const c of cases) {
  const real = ['webm', 'm4a', 'mp3', 'wav'].map(e => `${c.id}.rec.${e}`).find(f => fs.existsSync(path.join(DIR, f)));
  const file = real ?? `${c.id}.mp3`;
  const target = path.join(DIR, file);
  if (!real && (force || !fs.existsSync(target)) && (!only || only.includes(c.id))) {
    const v = VOICE[c.persona];
    const who = v.who[c.lang] ?? v.who.default;
    const instructions = `You are ${who}, leaving a quick, casual WhatsApp voice note in ${c.lang} to someone you know well. Use native ${c.lang === 'English' ? 'Indian English' : c.lang} pronunciation for every word, especially names. Speak fast and naturally, like everyday phone talk: no newsreader tone, no long pauses between phrases.`;
    tighten(await speak(c.script ?? c.text, v.voice, instructions), target);
    console.log('made', file);
  }
  index.push({ id: c.id, persona: c.persona, text: c.text, script: c.script, lang: c.lang, label: c.label, file, synthetic: !real, sample: !!c.sample });
}
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index.filter(x => x.sample), null, 1));
fs.writeFileSync('eval/clips.json', JSON.stringify(index, null, 1));
console.log(`${index.length} clips ready (${index.filter(x => !x.synthetic).length} real recordings)`);
