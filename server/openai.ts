// Thin OpenAI client: transcription, text-to-speech and JSON-schema responses. No SDK needed.
const BASE = 'https://api.openai.com/v1';
const key = () => {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error('OPENAI_API_KEY is missing');
  return k;
};

export const MODELS = {
  stt: process.env.ARTHA_STT_MODEL || 'gpt-transcribe',
  plan: process.env.ARTHA_PLAN_MODEL || 'gpt-6-luna',
  planEffort: (process.env.ARTHA_PLAN_EFFORT || 'none') as 'none' | 'minimal' | 'low' | 'medium',
  tts: 'gpt-4o-mini-tts',
};

export async function transcribe(audio: Buffer, mime: string, prompt?: string): Promise<string> {
  const ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime || 'audio/webm' }), `note.${ext}`);
  form.append('model', MODELS.stt);
  if (prompt) form.append('prompt', prompt);
  const r = await fetch(`${BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key()}` }, body: form });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Transcription failed: ${j?.error?.message ?? r.status}`);
  return String(j.text ?? '').trim();
}

export async function jsonCall<T>(opts: { instructions: string; input: string; schema: object; name: string; model?: string; effort?: string }): Promise<T> {
  const body: any = {
    model: opts.model ?? MODELS.plan,
    instructions: opts.instructions,
    input: opts.input,
    text: { format: { type: 'json_schema', name: opts.name, strict: true, schema: opts.schema } },
  };
  const effort = opts.effort ?? MODELS.planEffort;
  if (effort) body.reasoning = { effort };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j: any = await r.json();
    if (!r.ok) {
      const flagged = /flagged|usage policy/i.test(j?.error?.message ?? '');
      if (attempt < 1 && (r.status === 429 || r.status >= 500 || flagged)) { await new Promise(res => setTimeout(res, 800)); continue; }
      if (flagged) throw new Error('Artha could not process that note. Please say it a little differently.');
      throw new Error(`Model call failed: ${j?.error?.message ?? r.status}`);
    }
    // Use the first output_text part, and only its first complete JSON object.
    const text: string | undefined = j.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === 'output_text')?.text ?? j.output_text;
    const parsed = text ? firstJson(text) : null;
    if (parsed) return parsed as T;
    if (attempt >= 1) throw new Error('Model returned no usable answer');
  }
}

function firstJson(text: string): unknown | null {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

export async function speech(text: string, voice: string, instructions: string): Promise<Buffer> {
  const r = await fetch(`${BASE}/audio/speech`, {
    method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELS.tts, voice, input: text, instructions, response_format: 'mp3' }),
  });
  if (!r.ok) throw new Error(`Speech failed: ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
