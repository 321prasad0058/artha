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
  // 'off' = a model with no reasoning setting (gpt-4.1, gpt-4o)
  planEffort: (process.env.ARTHA_PLAN_EFFORT === 'off' ? '' : process.env.ARTHA_PLAN_EFFORT || 'none') as '' | 'none' | 'minimal' | 'low' | 'medium',
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

export async function jsonCall<T>(opts: { instructions: string; input: string | unknown[]; schema: object; name: string; model?: string; effort?: string }): Promise<T> {
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

/**
 * The same structured call, streamed: as each top-level field of the JSON finishes, onField(name, value) fires,
 * so the app can show "you said" and start speaking before the rest of the answer is written.
 */
export async function jsonStream<T>(opts: { instructions: string; input: string | unknown[]; schema: object; name: string; model?: string; effort?: string; onField: (name: string, value: unknown) => void }): Promise<T> {
  const body: any = { model: opts.model ?? MODELS.plan, instructions: opts.instructions, input: opts.input, stream: true,
    text: { format: { type: 'json_schema', name: opts.name, strict: true, schema: opts.schema } } };
  const effort = opts.effort ?? MODELS.planEffort;
  if (effort) body.reasoning = { effort };
  const r = await fetch(`${BASE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok || !r.body) {
    const j: any = await r.json().catch(() => ({}));
    if (/flagged|usage policy/i.test(j?.error?.message ?? '')) throw new Error('Artha could not process that note. Please say it a little differently.');
    throw new Error(`Model call failed: ${j?.error?.message ?? r.status}`);
  }
  const fields = new TopFields(opts.onField);
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of r.body as any) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const ev = JSON.parse(line.slice(5).trim());
      if (ev.type === 'response.output_text.delta') fields.push(ev.delta);
      else if (ev.type === 'error' || ev.type === 'response.failed') throw new Error(`Model call failed: ${ev.error?.message ?? ev.response?.error?.message ?? 'stream error'}`);
    }
  }
  const out = firstJson(fields.text);
  if (!out) throw new Error('Model returned no usable answer');
  return out as T;
}

/** Watches a JSON object being written character by character and reports each top-level field once it is complete. */
export class TopFields {
  text = ''; private i = 0; private depth = 0; private inStr = false; private esc = false;
  private key: string | null = null; private keyStart = -1; private valStart = -1;
  constructor(private onField: (name: string, value: unknown) => void) {}
  push(delta: string) {
    this.text += delta;
    for (; this.i < this.text.length; this.i++) {
      const ch = this.text[this.i];
      if (this.inStr) {
        if (this.esc) this.esc = false; else if (ch === '\\') this.esc = true;
        else if (ch === '"') { this.inStr = false; if (this.depth === 1 && this.key === null && this.keyStart >= 0 && this.valStart < 0) { this.key = JSON.parse(this.text.slice(this.keyStart, this.i + 1)); this.keyStart = -1; } else if (this.depth === 1 && this.valStart >= 0) this.done(this.i + 1); }
        continue;
      }
      if (ch === '"') { this.inStr = true; if (this.depth === 1 && this.key === null) this.keyStart = this.i; else if (this.depth === 1 && this.valStart < 0) this.valStart = this.i; continue; }
      if (ch === ':' && this.depth === 1) continue;
      if (ch === '{' || ch === '[') { if (this.depth === 1 && this.valStart < 0) this.valStart = this.i; this.depth++; continue; }
      if (ch === '}' || ch === ']') { this.depth--; if (this.depth === 1 && this.valStart >= 0) this.done(this.i + 1); else if (this.depth === 0 && this.valStart >= 0) this.done(this.i); continue; }
      if (this.depth === 1 && this.key !== null && this.valStart < 0 && /[-0-9tfn]/.test(ch)) this.valStart = this.i;
      if (this.depth === 1 && ch === ',' && this.valStart >= 0) this.done(this.i);
    }
  }
  private done(end: number) {
    if (this.key === null) return;
    try { this.onField(this.key, JSON.parse(this.text.slice(this.valStart, end).trim())); } catch { /* partial number: reported at the comma */ }
    this.key = null; this.valStart = -1;
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

/** Text to speech as a stream: audio bytes arrive while the rest is still being generated. */
export async function speechStream(text: string, voice: string, instructions: string): Promise<ReadableStream<Uint8Array>> {
  const r = await fetch(`${BASE}/audio/speech`, {
    method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELS.tts, voice, input: text, instructions, response_format: 'mp3' }),
  });
  if (!r.ok || !r.body) throw new Error(`Speech failed: ${r.status} ${await r.text()}`);
  return r.body;
}

export async function speech(text: string, voice: string, instructions: string): Promise<Buffer> {
  const r = await fetch(`${BASE}/audio/speech`, {
    method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELS.tts, voice, input: text, instructions, response_format: 'mp3' }),
  });
  if (!r.ok) throw new Error(`Speech failed: ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
