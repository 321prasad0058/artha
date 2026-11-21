// Narrator voice for the films. Same voice as the Kosha film: Gemini TTS, voice "Kore", with an Indian style direction.
// Falls back to OpenAI only if FILM_TTS=openai. Output: trimmed, tempo-adjusted mono WAV.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts';
const VOICE = 'Kore';
const NAME = 'The product is called अर्थ, written "Artha" in English. Say it the Hindi and Marathi way, "ur-tha": a short "a" as in "about", a soft dental aspirated "th" exactly like Hindi थ, and a light short "a" at the end. Never "earth", "aurat", "art" or "Arthur".';
export const DIRECTION = {
  en: `Read this as the warm, confident narrator of a short product film from India. Speak Indian English with a natural Indian accent, like an educated professional from Hyderabad or Mumbai: clear, unhurried, friendly, never American. Say Hindi, Marathi, Telugu and Tamil words with native pronunciation. ${NAME}`,
  hi: `Read this as the warm, confident narrator of a short product film from India. Speak natural, conversational Hindi the way educated people in Indian cities speak it, with common English words said the Indian way. Clear, unhurried, friendly. Native Hindi pronunciation for every word. ${NAME}`,
};

export const provider = () => (process.env.FILM_TTS === 'openai' || !process.env.GEMINI_API_KEY ? 'openai' : 'gemini');

async function geminiPcm(text, lang) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${DIRECTION[lang]}\n\n${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
      }),
    });
    const j = await r.json();
    const data = j?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (r.ok && data) return Buffer.from(data, 'base64');
    if (attempt < 4 && (r.status === 429 || r.status >= 500 || !data)) { await new Promise(res => setTimeout(res, 2500 * (attempt + 1))); continue; }
    throw new Error(`Gemini TTS ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  }
}

async function openaiWav(text, lang, voice, instructions) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, instructions, response_format: 'wav' }),
  });
  if (!r.ok) throw new Error(`OpenAI TTS ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Speak one line to `out` (wav): trimmed silence, tempo applied, 48 kHz mono. */
export async function speakLine(text, out, { lang = 'en', tempo = 1.0, voice = 'sage', instructions = '' } = {}) {
  const raw = `${out}.raw`;
  let input;
  if (provider() === 'gemini') { fs.writeFileSync(raw, await geminiPcm(text, lang)); input = ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', raw]; }
  else { fs.writeFileSync(raw, await openaiWav(text, lang, voice, instructions)); input = ['-i', raw]; }
  const af = `silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse${tempo !== 1 ? `,atempo=${tempo}` : ''}`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-af', af, '-ar', '48000', '-ac', '1', out]);
  fs.unlinkSync(raw);
}
