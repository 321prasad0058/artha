// Probe: (1) TTS a Hinglish note, (2) transcribe with and without name hints, (3) structured output via Responses API.
import fs from 'node:fs';
process.loadEnvFile('.env');
const K = process.env.OPENAI_API_KEY, H = { Authorization: `Bearer ${K}` };
const text = 'Anna ko bol do parcel security pe chhod de, aur Mehta ji wala appointment parso shaam ko shift karwa do. Aur Shankar bhaiya ko dhai sau bhej do.';
let t = Date.now();
const tts = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text, instructions: 'Speak casually like a young man from Hyderabad leaving a quick WhatsApp voice note in Hinglish, Indian accent.', response_format: 'mp3' }) });
if (!tts.ok) { console.log('TTS', tts.status, await tts.text()); process.exit(1); }
fs.mkdirSync('/tmp/artha-probe', { recursive: true });
fs.writeFileSync('/tmp/artha-probe/note.mp3', Buffer.from(await tts.arrayBuffer()));
console.log('tts ok', Date.now() - t, 'ms');
async function stt(model, prompt) {
  const f = new FormData();
  f.append('file', new Blob([fs.readFileSync('/tmp/artha-probe/note.mp3')], { type: 'audio/mpeg' }), 'note.mp3');
  f.append('model', model); if (prompt) f.append('prompt', prompt);
  const t0 = Date.now(); const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: H, body: f });
  const j = await r.json(); return `${model}${prompt ? ' +hints' : ''} [${Date.now() - t0}ms]: ${r.ok ? j.text : JSON.stringify(j).slice(0, 200)}`;
}
const hints = 'Voice note in Hinglish, written in Roman script. Names: Santosh Anna, Dr. Mehta, Mehta ji, Shankar bhaiya, Lakshmi akka.';
for (const m of ['gpt-transcribe', 'gpt-4o-transcribe']) { console.log(await stt(m)); console.log(await stt(m, hints)); }
t = Date.now();
const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({
  model: 'gpt-6.2-sol', reasoning: { effort: 'low' },
  input: 'Extract who is mentioned in: "Anna ko bol do parcel security pe chhod de". Candidates: santosh (Santosh Anna, delivery), lakshmi (Lakshmi akka, house help).',
  text: { format: { type: 'json_schema', name: 'who', strict: true, schema: { type: 'object', additionalProperties: false, required: ['id', 'score'], properties: { id: { type: 'string', enum: ['santosh', 'lakshmi', 'none'] }, score: { type: 'number' } } } } } }) });
const j = await r.json();
console.log('responses', r.status, Date.now() - t, 'ms', r.ok ? j.output_text ?? JSON.stringify(j.output?.find(o => o.type === 'message')?.content?.[0]?.text) : JSON.stringify(j.error));
