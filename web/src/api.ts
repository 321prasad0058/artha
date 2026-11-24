import type { Action, Contact, Mode, Result, State } from '../../server/types';
import type { Scan } from '../../server/pipeline/scan';
export type { Scan };

export type PersonaInfo = { id: string; name: string; age: number; about: string; city: string; speaks: string[]; avatar: string; contacts: Contact[]; source?: string; email?: string };
export type Sample = { id: string; persona: string; text: string; lang: string; label: string; file: string; synthetic: boolean };

/** Where the API lives: the same site by default (local server), or another host set at build time
 *  with VITE_API_BASE (the website on Firebase Hosting calls the API on Render). */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url.startsWith('/') ? API_BASE + url : url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}
const post = <T,>(url: string, body: unknown) => call<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  personas: () => call<PersonaInfo[]>('/api/personas'),
  state: (p: string) => call<State>(`/api/state?p=${p}`),
  samples: () => fetch('/clips/index.json').then(r => (r.ok ? r.json() : [])).catch(() => []) as Promise<Sample[]>,
  transcribe: (p: string, audio: Blob, mode: Mode) =>
    call<{ text: string; ms: number; hints: string[] }>(`/api/transcribe?p=${p}&mode=${mode}`, { method: 'POST', headers: { 'content-type': audio.type || 'audio/webm' }, body: audio }),
  understand: (p: string, transcript: string, mode: Mode, forced?: Record<string, string>) =>
    post<{ result: Result; state: State }>('/api/understand', { p, transcript, mode, forced }),
  answer: (p: string, mention: string, contactId: string, topic?: string, how?: 'asked' | 'changed') => post<{ state: State }>('/api/answer', { p, mention, contactId, topic, how }),
  act: (p: string, action: Action, confirmed = false) => post<{ done: string; state: State }>('/api/act', { p, action, confirmed }),
  skip: (p: string, id?: string, updates?: string) => (id ? post<{ ok: boolean }>('/api/skip', { p, id, updates }) : Promise.resolve({ ok: true })),
  scan: (p: string, image: string) => post<{ result: Result; scan: Scan; state: State }>('/api/scan', { p, image }),
  /** One note, streamed: each event (heard, gist, say, result, state, error) is handed over the moment it arrives. */
  note: async (p: string, input: { audio?: Blob; transcript?: string; voice?: boolean }, onEvent: (e: any) => void) => {
    const r = input.audio
      ? await fetch(`${API_BASE}/api/note?p=${encodeURIComponent(p)}&mode=artha${input.voice ? '&voice=inline' : ''}`, { method: 'POST', headers: { 'content-type': input.audio.type || 'audio/webm' }, body: input.audio })
      : await fetch(`${API_BASE}/api/note`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p, transcript: input.transcript, mode: 'artha', voice: input.voice ? 'inline' : undefined }) });
    if (!r.ok || !r.body) throw new Error(`Request failed (${r.status})`);
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onEvent(JSON.parse(line)); }
    }
    if (buf.trim()) onEvent(JSON.parse(buf));
  },
  persona: (p: string) => call<PersonaInfo>(`${API_BASE}/api/persona?p=${encodeURIComponent(p)}`),
  saveProfile: (p: string, x: { name: string; city: string; about: string; speaks: string[] }) => post<{ persona: PersonaInfo }>('/api/profile', { p, ...x }),
  forget: (p: string) => post<{ state: State }>('/api/me/forget', { p }),
  deleteMe: (p: string) => post<{ ok: boolean }>('/api/me/delete', { p }),
  context: (p: string) => call<{ counts: Record<string, number>; bytes: number; ttl_days: number }>(`${API_BASE}/api/context?p=${encodeURIComponent(p)}`),
  gmailStatus: (p: string) => call<{ configured: boolean; connected: boolean; email: string; lastSync: string; stats: Record<string, number> | null }>(`${API_BASE}/api/gmail/status?p=${encodeURIComponent(p)}`),
  gmailDisconnect: (p: string) => post<{ state: State }>('/api/gmail/disconnect', { p }),
  /** Gmail sync, streamed: progress events, then done (stats) and state. */
  gmailSync: async (p: string, onEvent: (e: any) => void) => {
    const r = await fetch(`${API_BASE}/api/gmail/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p }) });
    if (!r.ok || !r.body) throw new Error(`Sync failed (${r.status})`);
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i: number;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onEvent(JSON.parse(line)); } }
  },
  reset: (p: string) => post<{ state: State }>('/api/reset', { p }),
  results: () => call<any>('/api/results'),
};
