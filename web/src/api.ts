import type { Action, Contact, Mode, Result, State } from '../../server/types';
import type { Scan } from '../../server/pipeline/scan';
export type { Scan };

export type PersonaInfo = { id: string; name: string; age: number; about: string; city: string; speaks: string[]; avatar: string; contacts: Contact[] };
export type Sample = { id: string; persona: string; text: string; lang: string; label: string; file: string; synthetic: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
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
  reset: (p: string) => post<{ state: State }>('/api/reset', { p }),
  results: () => call<any>('/api/results'),
};
