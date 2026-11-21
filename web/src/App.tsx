import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, Mode, Result, State } from '../../server/types';
import { api, type PersonaInfo, type Sample } from './api';
import { startRecording, type Recording } from './recorder';

/* ---------------- icons ---------------- */
const P: Record<string, string> = {
  mic: 'M9 3h6v12H9zM5 11a7 7 0 0 0 14 0M12 18v3', play: 'M7 4.5v15l13-7.5z', send: 'M4 12l16-8-6 16-3-7z', check: 'M5 12.5l4.5 4.5L19 7',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z', spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  brain: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 3v3M12 18v3M3 12h3M18 12h3', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', info: 'M12 8v.5M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  back: 'M15 5l-7 7 7 7', call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  cal: 'M3.5 5h17v15h-17zM3.5 10h17M8 3v4M16 3v4', rupee: 'M7 5h10M7 9h10M7 5c5 0 7 2 7 4s-2 4-7 4l7 7', book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  x: 'M6 6l12 12M18 6L6 18', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M17 3a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', stop: 'M7 7h10v10H7z', compare: 'M8 3v18M16 3v18M3 8h5M16 16h5',
};
const I = ({ n, s }: { n: string; s?: React.CSSProperties }) => <svg className="ico" viewBox="0 0 24 24" style={s} aria-hidden="true"><path d={P[n]} /></svg>;
const ACT_ICON: Record<string, string> = { message: 'chat', call: 'call', reminder: 'bell', calendar: 'cal', payment: 'rupee', ledger: 'book', suggestion: 'spark' };

/* ---------------- helpers ---------------- */
type Tab = 'artha' | 'chats' | 'memory' | 'results' | 'about';
type Run = {
  id: number; source: 'mic' | 'sample' | 'typed'; label?: string; audio?: Blob; audioUrl?: string; synthetic?: boolean;
  stage: number; transcript?: string; hearMs?: number; result?: Result; error?: string;
  done: Record<number, string>; busy?: number | null; confirm?: number | null; answering?: boolean;
  compare?: { loading: boolean; baseHeard?: string; base?: Result; ctx?: Result; error?: string };
};
let seq = 0;
const nonLatin = (s: string) => /[ऀ-෿]/.test(s);
const fmtTime = (iso: string) => { const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
function bars(seed: number, n = 24) { const out: number[] = []; let x = seed * 9301 + 49297; for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; out.push(6 + Math.round((x / 233280) * 18 * (0.55 + 0.45 * Math.sin(i / 3)))); } return out; }
const Bars = ({ seed, n }: { seed: number; n?: number }) => <span className="bars">{bars(seed, n).map((h, i) => <i key={i} style={{ height: Math.max(5, h) }} />)}</span>;

/** Highlight words inside a sentence. */
function Highlight({ text, marks }: { text: string; marks: { text: string; cls: string; label: string }[] }) {
  const parts: React.ReactNode[] = []; let rest = text; let k = 0;
  const ms = marks.filter(m => m.text && text.includes(m.text)).sort((a, b) => text.indexOf(a.text) - text.indexOf(b.text));
  for (const m of ms) {
    const i = rest.indexOf(m.text); if (i < 0) continue;
    if (i) parts.push(rest.slice(0, i));
    parts.push(<span key={k++} className={`ent ${m.cls}`} title={m.label}>{m.text}<sub>{m.label}</sub></span>);
    rest = rest.slice(i + m.text.length);
  }
  parts.push(rest);
  return <>{parts}</>;
}

/* ================= APP ================= */
export default function App() {
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [pid, setPid] = useState<string>(() => { try { return localStorage.getItem('artha.p') || 'aditya'; } catch { return 'aditya'; } });
  const [pstate, setPstate] = useState<State | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [tab, setTab] = useState<Tab>('artha');
  const [runs, setRuns] = useState<Record<string, Run[]>>({});
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [newMem, setNewMem] = useState(0);
  const feed = useRef<HTMLDivElement>(null);

  const persona = personas.find(p => p.id === pid);
  const myRuns = runs[pid] ?? [];
  const say = (t: string) => { setToast(t); window.clearTimeout((say as any)._t); (say as any)._t = window.setTimeout(() => setToast(''), 2400); };

  useEffect(() => { api.personas().then(setPersonas).catch(e => say(e.message)); api.samples().then(setSamples); }, []);
  useEffect(() => { try { localStorage.setItem('artha.p', pid); } catch { /* private mode */ } setPstate(null); setOpenChat(null); api.state(pid).then(setPstate).catch(e => say(e.message)); }, [pid]);
  const scrollDown = () => requestAnimationFrame(() => feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }));

  const update = useCallback((id: number, patch: Partial<Run> | ((r: Run) => Partial<Run>)) => {
    setRuns(all => ({ ...all, [pid]: (all[pid] ?? []).map(r => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)) }));
  }, [pid]);
  const applyState = (s: State) => { setPstate(prev => { if (prev && s.memory.length > prev.memory.length) setNewMem(n => n + (s.memory.length - prev.memory.length)); return s; }); };

  /* ---------- the pipeline, as the user sees it ---------- */
  async function process(run: Run) {
    setRuns(all => ({ ...all, [pid]: [...(all[pid] ?? []), run] }));
    setTab('artha'); scrollDown();
    try {
      let transcript = run.transcript ?? '';
      if (run.audio) {
        const h = await api.transcribe(pid, run.audio, 'artha');
        transcript = h.text;
        update(run.id, { transcript, hearMs: h.ms, stage: 1 });
        if (!transcript) throw new Error('Nothing was heard. Try again a little closer to the mic.');
      } else update(run.id, { stage: 1 });
      const t1 = setTimeout(() => update(run.id, r => (r.stage < 3 ? { stage: 3 } : {})), 250);
      const out = await api.understand(pid, transcript, 'artha');
      clearTimeout(t1);
      update(run.id, { result: out.result, stage: 5 });
      applyState(out.state); scrollDown();
    } catch (e: any) { update(run.id, { error: e.message, stage: 5 }); }
  }
  const fromAudio = (audio: Blob, source: Run['source'], label?: string, synthetic?: boolean) =>
    process({ id: ++seq, source, label, audio, audioUrl: URL.createObjectURL(audio), synthetic, stage: 0, done: {} });
  const fromText = (text: string) => process({ id: ++seq, source: 'typed', transcript: text, stage: 0, done: {} });
  async function playSample(s: Sample) {
    try { const b = await (await fetch(`/clips/${s.file}`)).blob(); fromAudio(b, 'sample', s.label, s.synthetic); } catch { say('Could not load that sample.'); }
  }

  async function act(run: Run, i: number, confirmed = false) {
    const a = run.result!.actions[i];
    if (a.type === 'payment' && !confirmed) { update(run.id, { confirm: i }); return; }
    update(run.id, { busy: i });
    try { const r = await api.act(pid, a, confirmed); applyState(r.state); update(run.id, x => ({ done: { ...x.done, [i]: r.done }, busy: null, confirm: null })); say(r.done); }
    catch (e: any) { update(run.id, { busy: null }); say(e.message); }
  }
  const skip = (run: Run, i: number) => update(run.id, x => ({ done: { ...x.done, [i]: 'Skipped' } }));
  async function doAllSafe(run: Run) {
    for (const [i, a] of run.result!.actions.entries()) if (['message', 'calendar', 'reminder', 'ledger'].includes(a.type) && !run.done[i]) await act(run, i);
  }
  async function answer(run: Run, contactId: string) {
    const c = run.result!.clarify!;
    update(run.id, { answering: true });
    try {
      const a = await api.answer(pid, c.mention, contactId); applyState(a.state);
      const out = await api.understand(pid, run.transcript ?? run.result!.transcript, 'artha', { [c.mention]: contactId });
      update(run.id, { result: out.result, answering: false }); applyState(out.state); scrollDown();
    } catch (e: any) { update(run.id, { answering: false, error: e.message }); }
  }
  async function compare(run: Run) {
    update(run.id, { compare: { loading: true } });
    try {
      let heard = run.transcript ?? run.result?.transcript ?? '';
      if (run.audio) heard = (await api.transcribe(pid, run.audio, 'base')).text;
      const [b, c] = await Promise.all([api.understand(pid, heard, 'base'), api.understand(pid, heard, 'base_ctx')]);
      update(run.id, { compare: { loading: false, baseHeard: heard, base: b.result, ctx: c.result } });
    } catch (e: any) { update(run.id, { compare: { loading: false, error: e.message } }); }
  }
  async function reset() {
    const r = await api.reset(pid); setPstate(r.state); setRuns(all => ({ ...all, [pid]: [] })); setNewMem(0); say(`${persona?.name.split(' ')[0]}’s data is back to the start`);
  }

  const mySamples = samples.filter(s => s.persona === pid);
  const unread = useMemo(() => pstate ? Object.entries(pstate.threads).filter(([, t]) => t.at(-1)?.via && Date.now() - Date.parse(t.at(-1)!.at) < 10 * 60e3).length : 0, [pstate]);
  const go = (t: Tab) => { setTab(t); if (t === 'memory') setNewMem(0); };
  const wide = tab === 'results' || tab === 'about';

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><img className="logo" src="/icon.svg" alt="" /><div><b>Artha</b><span>Bas ishaara kaafi hai.</span></div></div>
        <nav className="topnav" aria-label="Views">
          {(['artha', 'chats', 'results', 'about'] as Tab[]).map(t => (
            <button key={t} className={t === 'chats' ? '' : ''} aria-current={(tab === t || (t === 'artha' && tab === 'memory')) ? 'page' : undefined} onClick={() => go(t)}>
              {{ artha: 'Artha', chats: 'Chats', results: 'Results', about: 'About', memory: 'Memory' }[t]}
            </button>))}
        </nav>
        {persona && <button className="who-btn" onClick={() => setMenu(true)} aria-label="Switch person"><span className="av ink">{persona.avatar}</span><span className="nm">{persona.name}</span></button>}
      </header>

      <main className="main" data-tab={tab}>
        {wide ? (
          <div className="page">{tab === 'results' ? <Results /> : <About personas={personas} onTry={() => go('artha')} />}</div>
        ) : (<>
          {/* ---------- chats ---------- */}
          <section className="pane pane-chats" aria-label="Chats">
            {persona && !openChat && (<>
              <div className="pc-head">
                <div className="who"><span className="av lg ink">{persona.avatar}</span><div><b>{persona.name}, {persona.age}</b><small>{persona.about}</small></div></div>
                <div className="pc-langs">{persona.speaks.map(l => <span key={l} className="chip">{l}</span>)}<button className="chip accent" onClick={() => setMenu(true)}>Switch person</button></div>
              </div>
              {pstate && persona.contacts.map(c => {
                const t = pstate.threads[c.id] ?? []; const last = t.at(-1);
                const fresh = !!last?.via && Date.now() - Date.parse(last.at) < 10 * 60e3;
                return (
                  <button key={c.id} className={`chatrow ${fresh ? 'unread' : ''}`} onClick={() => setOpenChat(c.id)}>
                    <span className="av">{c.name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('')}</span>
                    <span className="t"><span className="n"><span>{c.name}</span><span>{last ? fmtTime(last.at) : ''}</span></span><span className="l">{last ? `${last.me ? 'You: ' : ''}${last.text}` : `${c.rel} · ${c.lang}`}</span></span>
                  </button>);
              })}
            </>)}
            {persona && openChat && pstate && (() => {
              const c = persona.contacts.find(x => x.id === openChat)!;
              return (<>
                <div className="thread-head"><button className="btn btn-ghost btn-sm" onClick={() => setOpenChat(null)} aria-label="Back"><I n="back" /></button><span className="av">{c.name[0]}</span><div><b style={{ fontSize: 14.5 }}>{c.name}</b><div className="dim" style={{ fontSize: 12 }}>{c.rel} · prefers {c.lang}</div></div></div>
                <div className="bubbles">{(pstate.threads[c.id] ?? []).map((m, i) => <div key={i} className={`bub ${m.me ? 'me' : 'them'}`}>{m.via && <span className="via">{m.via}</span>}{m.text}<time>{fmtTime(m.at)}</time></div>)}</div>
              </>);
            })()}
          </section>

          {/* ---------- Artha thread ---------- */}
          <section className="pane pane-thread" aria-label="Artha">
            <div className="feed" ref={feed}>
              <div className="hello">
                <p className="eyebrow">{persona ? `You are ${persona.name.split(' ')[0]} · ${persona.city}` : 'Loading…'}</p>
                <h2>Say a little. <em>Artha</em> gets the rest.</h2>
                <p>Hold the mic and leave a voice note the way you would to a person: nicknames, “parso”, “usko”, any Indian language. Artha works out who and what you mean from {persona ? `${persona.name.split(' ')[0]}’s` : 'your'} contacts, calls and habits, then gets it ready to do.</p>
                {mySamples.length > 0 && <>
                  <p className="dim" style={{ fontSize: 13 }}>Or play a sample note for {persona?.name.split(' ')[0]}:</p>
                  <div className="samples">{mySamples.map(s => (
                    <button key={s.id} className="sample" onClick={() => playSample(s)}>
                      <span className="s-top"><I n="play" s={{ width: 12, height: 12, fill: 'currentColor', stroke: 'none' }} />{s.label}<span className="chip" style={{ marginLeft: 'auto' }}>{s.lang}</span></span>
                      <span className="s-text">“{s.text}”</span>
                    </button>))}
                  </div></>}
              </div>
              {myRuns.map(r => <Note key={r.id} run={r} persona={persona} onAct={act} onSkip={skip} onAll={doAllSafe} onAnswer={answer} onCompare={compare} />)}
            </div>
            <Composer onAudio={b => fromAudio(b, 'mic')} onText={fromText} say={say} />
          </section>

          {/* ---------- memory & data ---------- */}
          <aside className="pane pane-side" aria-label="Memory">
            <div className="card side-card">
              <h3><I n="brain" />What Artha knows<span className="chip">{pstate?.memory.length ?? 0} facts</span></h3>
              <div className="mem">{pstate && [...pstate.memory].reverse().map((m, i) => (
                <div key={i} className={`mem-i ${m.learned ? 'new' : ''}`}><I n={m.learned ? 'spark' : 'brain'} s={{ width: 15, height: 15, marginTop: 2, color: m.learned ? 'var(--accent)' : 'var(--dim)' }} /><span>{m.fact}<small>{m.learned ? 'Learned · ' : ''}{m.src}</small></span></div>))}</div>
            </div>
            {pstate && (pstate.calendar.length > 0 || pstate.reminders.length > 0) && (
              <div className="card side-card"><h3><I n="cal" />Calendar and reminders</h3>
                <div className="mini-list">{[...pstate.calendar.map(c => ({ t: c.title, w: c.when_label, n: c.added })), ...pstate.reminders.map(r => ({ t: `⏰ ${r.title}`, w: r.when_label, n: true }))].map((x, i) => <div key={i}><span style={{ fontWeight: x.n ? 600 : 400 }}>{x.t}</span><span>{x.w}</span></div>)}</div></div>)}
            {pstate && pstate.ledger.length > 0 && (
              <div className="card side-card"><h3><I n="book" />Credit ledger (udhaar)</h3>
                <div className="mini-list">{Object.entries(pstate.ledger.reduce<Record<string, number>>((m, l) => ({ ...m, [l.contact]: (m[l.contact] ?? 0) + l.amount }), {})).map(([c, amt]) => <div key={c}><span>{persona?.contacts.find(x => x.id === c)?.name}</span><span>₹{amt.toLocaleString('en-IN')} due</span></div>)}</div></div>)}
            {pstate && (pstate.payments.length > 0 || pstate.calls.length > 0) && (
              <div className="card side-card"><h3><I n="check" />Done by Artha</h3>
                <div className="mini-list">{pstate.payments.map((p, i) => <div key={'p' + i}><span>Paid {persona?.contacts.find(x => x.id === p.contact)?.name}</span><span>₹{p.amount}</span></div>)}{pstate.calls.map((c, i) => <div key={'c' + i}><span>Call {persona?.contacts.find(x => x.id === c.contact)?.name}</span><span>{c.status}</span></div>)}</div></div>)}
            <div className="card side-card">
              <p className="muted" style={{ fontSize: 13 }}>Everything here is saved on the server, so it is still here after a refresh or a restart. {pstate ? `${pstate.notes} notes so far.` : ''}</p>
              <button className="btn btn-ghost btn-sm" onClick={reset}><I n="refresh" />Reset {persona?.name.split(' ')[0]}’s data</button>
            </div>
          </aside>
        </>)}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {([['artha', 'spark', 'Artha'], ['chats', 'chat', 'Chats'], ['memory', 'brain', 'Memory'], ['results', 'chart', 'Results'], ['about', 'info', 'About']] as const).map(([t, ic, l]) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}><I n={ic} />{l}{((t === 'chats' && unread > 0) || (t === 'memory' && newMem > 0)) && <span className="dot" />}</button>))}
      </nav>

      {menu && (
        <div className="menu-bg" onClick={() => setMenu(false)}>
          <div className="menu" role="dialog" aria-label="Choose a person" onClick={e => e.stopPropagation()}>
            <h4>Test as a different person</h4>
            {personas.map(p => (
              <button key={p.id} aria-current={p.id === pid} onClick={() => { setPid(p.id); setMenu(false); setTab('artha'); }}>
                <span className="av lg ink">{p.avatar}</span><span><b>{p.name}, {p.age} · {p.city}</b><small>{p.about}</small><small style={{ color: 'var(--accent)' }}>{p.speaks.join(' · ')}</small></span>
              </button>))}
          </div>
        </div>)}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ================= one voice note ================= */
function Note({ run, persona, onAct, onSkip, onAll, onAnswer, onCompare }: {
  run: Run; persona?: PersonaInfo; onAct: (r: Run, i: number, confirmed?: boolean) => void; onSkip: (r: Run, i: number) => void;
  onAll: (r: Run) => void; onAnswer: (r: Run, id: string) => void; onCompare: (r: Run) => void;
}) {
  const res = run.result;
  const playing = useRef<HTMLAudioElement | null>(null);
  const play = () => { if (!run.audioUrl) return; playing.current?.pause(); playing.current = new Audio(run.audioUrl); playing.current.play().catch(() => {}); };
  const stages: [string, number | undefined][] = [['Heard', run.source === 'typed' ? undefined : run.hearMs], ['Meaning', res?.ms.meaning], ['Who', res?.ms.who], ['Plan', res?.ms.plan]];
  const heard = run.transcript ?? res?.transcript ?? '';
  const personMarks = (res?.mentions ?? []).filter(m => m.kind === 'person').map(m => ({ text: m.text, cls: 'person', label: m.candidates.length ? [...m.candidates].sort((a, b) => b.score - a.score)[0].name : '?' }));
  const codeMarks = (res?.entities ?? []).map(e => ({ text: e.text, cls: e.kind, label: e.label.replace(/^.*→ /, '') }));
  const safe = res?.actions.filter((a, i) => ['message', 'calendar', 'reminder', 'ledger'].includes(a.type) && !run.done[i]).length ?? 0;
  const c = (id: string) => persona?.contacts.find(x => x.id === id);

  return (
    <article className="note">
      <div className="me">
        {run.source === 'typed' ? <div className="heard">{heard}</div> : (
          <div className="voice"><button className="play" onClick={play} aria-label="Play the voice note"><I n="play" /></button><Bars seed={run.id + 7} /></div>)}
        <div className="meta">{run.source === 'mic' ? 'Your voice note' : run.source === 'sample' ? `Sample · ${run.label}${run.synthetic ? ' · synthetic voice' : ''}` : 'Typed'}</div>
      </div>

      <div className="stages" aria-label="Progress">
        {stages.map(([n, ms], i) => {
          const blocked = res?.blocked && i >= 2;
          const cls = run.error ? (i === 0 && run.transcript ? 'done' : '') : blocked ? '' : run.stage > i + (i >= 1 ? 3 : 0) || (res && !blocked) ? 'done' : (run.stage === i || (run.stage >= 1 && run.stage <= 3 && i >= 1 && !res)) ? 'run' : '';
          return <span key={n} className={`stg ${cls}`}>{cls === 'done' && <I n="check" />}{n}{cls === 'done' && ms !== undefined && <span className="ms">{ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}</span>}{i === 0 && run.source === 'typed' && cls === 'done' && <span className="ms">typed</span>}</span>;
        })}
        {res?.blocked && <span className="stg stop"><I n="shield" />Stopped by a safety rule</span>}
      </div>

      {run.error && <div className="ai"><span className="err">{run.error}</span></div>}
      {!res && !run.error && <div className="think"><span className="dots"><i /><i /><i /></span>{run.stage === 0 ? 'Listening to the note…' : 'Working out who and what you mean…'}</div>}

      {res && (
        <div className="ai">
          <div className="ai-h"><I n="spark" s={{ width: 14, height: 14 }} />Artha understood{res.language && <span className="chip">{res.language}</span>}</div>
          <div className="tx"><Highlight text={res.transcript} marks={[...personMarks, ...(nonLatin(res.transcript) ? [] : codeMarks)]} /></div>
          {nonLatin(res.transcript) && <div className="roman"><Highlight text={res.roman} marks={codeMarks} /></div>}

          {res.blocked && <div className="act" style={{ borderColor: 'var(--red)', background: 'var(--red-soft)' }}><div className="act-h"><span className="act-i" style={{ color: 'var(--red)' }}><I n="shield" /></span><div><div className="act-t">Artha will never share an OTP</div><div className="act-s">The digits were hidden before any AI model or log saw them.</div></div></div></div>}

          {res.clarify && (
            <div className="clar"><b>{res.clarify.question}</b><span className="muted" style={{ fontSize: 12.5 }}>Two people fit almost equally, so Artha asks once instead of guessing, and remembers your answer.</span>
              <div className="opts">{res.clarify.options.map(o => <button key={o.id} className="btn btn-ghost btn-sm" disabled={run.answering} onClick={() => onAnswer(run, o.id)}>{o.label}{c(o.id) ? ` · ${c(o.id)!.rel}` : ''}</button>)}</div>
              {run.answering && <div className="think"><span className="dots"><i /><i /><i /></span>Got it. Planning…</div>}
            </div>)}

          {res.actions.length > 0 && (
            <div className="acts">
              {safe > 1 && <div className="doall"><span>{res.actions.length} actions ready</span><button className="btn btn-primary btn-sm" onClick={() => onAll(run)}><I n="check" s={{ width: 15, height: 15 }} />Do all safe ones</button></div>}
              {res.actions.map((a, i) => <ActionCard key={i} a={a} done={run.done[i]} busy={run.busy === i} confirming={run.confirm === i} contact={c(a.contact_id)}
                onDo={() => onAct(run, i)} onConfirm={() => onAct(run, i, true)} onSkip={() => onSkip(run, i)} />)}
            </div>)}

          {res.reply && <div className="muted" style={{ fontSize: 14 }}>“{res.reply}”</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!run.compare && <button className="linkish" onClick={() => onCompare(run)}><I n="compare" s={{ width: 15, height: 15 }} />Compare with the base model</button>}
          </div>
          {run.compare && <Compare cmp={run.compare} />}

          <details className="inside">
            <summary><I n="eye" s={{ width: 15, height: 15 }} />How Artha understood this</summary>
            <div className="stagebox">
              <div className="sb"><span className="n">1</span><div className="body"><h6>Hear <span className="chip accent">AI</span></h6>{run.source === 'typed' ? 'Typed, so no transcription.' : <>Transcribed with {persona?.contacts.length ?? 0} contact names as hints, in {run.hearMs} ms.</>}</div></div>
              <div className="sb"><span className="n">2</span><div className="body"><h6>Meaning <span className="chip">Code</span></h6>{res.entities.length ? res.entities.map((e, i) => <div key={i}><b>{e.text}</b> → {e.label}</div>) : 'No dates, times or amounts.'}{res.roman !== res.transcript && <div className="dim">Read as: {res.roman}</div>}</div></div>
              <div className="sb"><span className="n">3</span><div className="body"><h6>Who <span className="chip">Code</span> + <span className="chip accent">AI</span></h6>
                {res.mentions.filter(m => m.kind === 'person').map((m, i) => (
                  <div key={i} style={{ display: 'grid', gap: 4 }}><b>“{m.text}”</b>{[...m.candidates].sort((a, b) => b.score - a.score).slice(0, 3).map(cd => (
                    <div key={cd.id} className="cand"><span>{cd.name}</span><span className="mono" style={{ textAlign: 'right' }}>{Math.round(cd.score * 100)}%</span><div className="meter"><i style={{ width: `${Math.round(cd.score * 100)}%` }} /></div>{cd.why && <small>{cd.why}</small>}</div>))}</div>))}
                {!res.mentions.some(m => m.kind === 'person') && (res.blocked ? 'Skipped: stopped by a safety rule.' : 'No people mentioned.')}
                {res.candidates.length > 0 && <div className="dim">Code shortlist: {res.candidates.map(cd => `${cd.name} (${cd.why})`).join('; ')}</div>}</div></div>
              <div className="sb"><span className="n">4</span><div className="body"><h6>Plan <span className="chip accent">AI</span></h6>{res.clarify ? 'Two people fit closely, so: ask one question.' : `${res.actions.length} action${res.actions.length === 1 ? '' : 's'}, each in the recipient’s language.`}</div></div>
              <div className="sb"><span className="n">5</span><div className="body"><h6>Rules <span className="chip">Code</span></h6>{res.checks.map((ck, i) => <div key={i} style={{ color: ck.ok ? 'var(--green)' : 'var(--red)' }}>{ck.ok ? '✓' : '✗'} {ck.rule}</div>)}</div></div>
              <div className="sb"><span className="n">6</span><div className="body"><h6>Learn <span className="chip">Code</span></h6>{res.learn.length ? res.learn.map((l, i) => <div key={i}>+ {l}</div>) : 'Nothing new to remember.'}</div></div>
            </div>
          </details>
        </div>)}
    </article>
  );
}

function ActionCard({ a, done, busy, confirming, contact, onDo, onConfirm, onSkip }: {
  a: Action; done?: string; busy: boolean; confirming: boolean; contact?: { name: string; rel: string; lang: string; upi?: string }; onDo: () => void; onConfirm: () => void; onSkip: () => void;
}) {
  const title = { message: `Message ${a.contact_name}`, call: `Call ${a.contact_name} for you`, reminder: 'Reminder', calendar: 'Add to calendar', payment: `Pay ${a.contact_name}`, ledger: `Add to ${a.contact_name}’s credit`, suggestion: a.title || 'Suggestion' }[a.type];
  const sub = { message: `in ${a.language || contact?.lang || ''}`, call: 'Artha speaks for you; take over any time', reminder: a.when_label, calendar: a.when_label, payment: `₹${a.amount_inr.toLocaleString('en-IN')} by UPI${contact?.upi ? ` · ${contact.upi}` : ''}`, ledger: `₹${a.amount_inr.toLocaleString('en-IN')}`, suggestion: 'Suggested' }[a.type];
  const tag = a.predicted ? <span className="chip amber">Predicted</span> : a.type === 'payment' ? <span className="chip green">Needs you</span> : a.type === 'message' && a.language ? <span className="chip accent">{a.language}</span> : null;
  const body = a.type === 'message' ? <div className="act-body">{a.text}{a.gloss && <small>{a.gloss}</small>}</div>
    : a.type === 'call' ? <div className="act-body"><b>Goal:</b> {a.goal || a.text}{a.when_label && <small>{a.when_label}</small>}</div>
    : (a.type === 'reminder' || a.type === 'calendar' || a.type === 'ledger') && (a.title || a.text) ? <div className="act-body">{a.title || a.text}</div> : null;
  const verb = { message: 'Send', call: 'Let Artha call', reminder: 'Set reminder', calendar: 'Add', payment: 'Review and pay', ledger: 'Add to ledger', suggestion: 'Yes' }[a.type];
  return (
    <div className={`act ${done ? 'done' : ''}`}>
      <div className="act-h"><span className={`act-i ${a.type}`}><I n={ACT_ICON[a.type]} /></span><div style={{ minWidth: 0 }}><div className="act-t">{title}</div>{sub && <div className="act-s">{sub}</div>}</div>{tag}</div>
      {body}
      {a.why && <div className="act-why">Why: {a.why}</div>}
      {done ? <div className="ok"><I n="check" s={{ width: 15, height: 15 }} />{done}</div>
        : confirming ? <><div className="confirm">Pay <b>₹{a.amount_inr.toLocaleString('en-IN')}</b> to <b>{a.contact_name}</b>{contact?.upi ? ` (${contact.upi})` : ''}? This is a demo: no real money moves.</div>
          <div className="act-btns"><button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={busy}>Confirm and pay</button><button className="btn btn-ghost btn-sm" onClick={onSkip}>Cancel</button></div></>
        : <div className="act-btns"><button className="btn btn-primary btn-sm" onClick={onDo} disabled={busy}>{busy ? 'Working…' : verb}</button><button className="btn btn-ghost btn-sm" onClick={onSkip}>{a.type === 'suggestion' ? 'No' : 'Skip'}</button></div>}
    </div>
  );
}

function Compare({ cmp }: { cmp: NonNullable<Run['compare']> }) {
  if (cmp.loading) return <div className="think"><span className="dots"><i /><i /><i /></span>Running the same note through the base model…</div>;
  if (cmp.error) return <div className="err">{cmp.error}</div>;
  const col = (title: string, r?: Result, heard?: string) => (
    <div className="cmp"><h5>{title}</h5>
      {heard !== undefined && <div className="heard">Heard: “{heard}”</div>}
      {r && r.actions.length ? <ul>{r.actions.map((a, i) => <li key={i}><b>{a.type}</b>{a.contact_name ? ` → ${a.contact_name}` : ''}{a.text ? `: “${a.text}”` : a.title ? `: ${a.title}` : ''}{a.when_label ? ` · ${a.when_label}` : ''}{a.amount_inr ? ` · ₹${a.amount_inr}` : ''}</li>)}</ul> : <span className="dim">No actions</span>}
    </div>);
  return <div className="compare">{col('Base model', cmp.base, cmp.baseHeard)}{col('Base + pasted context', cmp.ctx)}</div>;
}

/* ================= composer: hold to talk, tap to toggle, or type ================= */
function Composer({ onAudio, onText, say }: { onAudio: (b: Blob) => void; onText: (t: string) => void; say: (t: string) => void }) {
  const [rec, setRec] = useState<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const [secs, setSecs] = useState(0);
  const [text, setText] = useState('');
  const pressedAt = useRef(0);
  const timer = useRef<number>();
  const starting = useRef(false);

  async function start() {
    if (rec || starting.current) return;
    starting.current = true;
    try {
      const r = await startRecording(setLevel); setRec(r); setSecs(0);
      const t0 = Date.now(); timer.current = window.setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSecs(s); if (s >= 45) stop(r); }, 250);
    } catch { say('Allow the microphone to record, or type your note instead.'); }
    finally { starting.current = false; }
  }
  async function stop(r = rec) {
    if (!r) return; window.clearInterval(timer.current); setRec(null);
    const b = await r.stop(); if (b.size > 2000) onAudio(b); else say('That was too short. Hold the mic while you talk.');
  }
  const down = (e: React.PointerEvent) => { e.preventDefault(); pressedAt.current = Date.now(); if (rec) { stop(); return; } start(); };
  const up = () => { if (rec && Date.now() - pressedAt.current > 450) stop(); }; // long press = hold to talk; short tap = toggle

  return (
    <div className="composer">
      {rec && <div className="rec-bar"><span>● Recording {secs}s</span><Bars seed={secs + 3} n={Math.round(6 + level * 30)} /><span className="dim" style={{ fontWeight: 500 }}>release or tap to send</span></div>}
      <form className="composer-in" onSubmit={e => { e.preventDefault(); if (text.trim()) { onText(text.trim()); setText(''); } }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Or type a note: “Rahul ko bolo kal 4 baje”" aria-label="Type a note" />
        {text.trim() ? <button className="send" aria-label="Send note"><I n="send" /></button> : (
          <button type="button" className={`mic ${rec ? 'rec' : ''}`} onPointerDown={down} onPointerUp={up} onPointerLeave={up} onContextMenu={e => e.preventDefault()} aria-label={rec ? 'Stop and send' : 'Hold to talk'}>
            {rec && <span className="ring" style={{ transform: `scale(${1 + level * 0.35})` }} />}<I n={rec ? 'stop' : 'mic'} />
          </button>)}
      </form>
    </div>
  );
}

/* ================= results ================= */
function Results() {
  const [data, setData] = useState<any>(undefined);
  useEffect(() => { api.results().then(setData).catch(() => setData(null)); }, []);
  const SYS = [['base', 'Base model'], ['base_ctx', 'Base + pasted context'], ['artha', 'Artha']] as const;
  const METRICS = [['names', 'Names heard correctly'], ['contact', 'Right person chosen'], ['values', 'Dates and amounts exact'], ['intent', 'Right kind of action'], ['whole', 'Whole note right'], ['safety', 'Safety cases handled']] as const;
  return (
    <div className="wrap">
      <div style={{ display: 'grid', gap: 8 }}><p className="eyebrow">Results · Track 2: same recordings, base model vs Artha</p><h1>Does Artha understand more?</h1>
        <p className="lead">Every clip has a correct answer written down before it is run. Each system hears the same audio. “Base + pasted context” is the obvious shortcut: the whole contact list pasted into the prompt.</p></div>
      {data === undefined && <p className="muted">Loading…</p>}
      {data === null && <div className="card box"><h3>No results yet</h3><p>Run <span className="mono">npm run eval</span> on the server to score all clips. The table appears here.</p></div>}
      {data && <>
        <div className="card tbl"><table className="t">
          <thead><tr><th>Metric</th>{SYS.map(([k, l]) => <th key={k} className="n">{l}</th>)}</tr></thead>
          <tbody>{METRICS.map(([m, l]) => {
            const vals = SYS.map(([k]) => data.systems?.[k]?.[m]); const best = Math.max(...vals.filter((v: any) => typeof v === 'number'));
            return <tr key={m}><td>{l}</td>{vals.map((v: any, i: number) => <td key={i} className="n">{typeof v === 'number' ? <div className="barcell"><span className={v === best ? 'best' : ''}>{Math.round(v * 100)}%</span><div className="hbar"><i style={{ width: `${Math.round(v * 100)}%`, background: SYS[i][0] === 'artha' ? 'var(--accent)' : 'var(--line-2)' }} /></div></div> : '—'}</td>)}</tr>;
          })}
            <tr><td>Median seconds per note</td>{SYS.map(([k]) => <td key={k} className="n">{data.systems?.[k]?.median_s ?? '—'}</td>)}</tr>
          </tbody></table></div>
        <p className="muted" style={{ fontSize: 13.5 }}>{data.cases} clips across {data.personas} people and {data.languages?.join(', ')}. {data.synthetic} clips use OpenAI voices and are marked synthetic; the rest were recorded by Prasad. Run at {new Date(data.generatedAt).toLocaleString('en-IN')} with {data.model}.</p>
        <div className="card tbl"><table className="t">
          <thead><tr><th>Clip</th><th>What was said</th>{SYS.map(([k, l]) => <th key={k} className="n">{l}</th>)}</tr></thead>
          <tbody>{data.perCase?.map((c: any) => <tr key={c.id}><td><b>{c.id}</b><div className="dim" style={{ fontSize: 12 }}>{c.persona} · {c.lang}{c.synthetic ? ' · synthetic' : ''}</div></td><td style={{ minWidth: 220 }}>{c.text}{c.notes?.artha && <div className="dim" style={{ fontSize: 12 }}>{c.notes.artha}</div>}</td>{SYS.map(([k]) => <td key={k} className="n">{c.whole?.[k] ? <span className="best">✓</span> : <span style={{ color: 'var(--red)' }}>✗</span>}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
    </div>
  );
}

/* ================= about ================= */
function About({ personas, onTry }: { personas: PersonaInfo[]; onTry: () => void }) {
  return (
    <div className="wrap">
      <div style={{ display: 'grid', gap: 10 }}>
        <p className="eyebrow">Builders 2026 · Track 2 · Voice AI for India</p>
        <h1>Artha: Bas ishaara kaafi hai.</h1>
        <p className="lead"><i>Artha</i> means “meaning” in Hindi, Marathi, Telugu, Tamil and Kannada. Indians run their lives on short voice notes full of nicknames, “parso” and “wahi wala”. Speech models hear the words but miss the meaning. Artha adds the missing layer: it uses what your phone already knows about your life to work out who and what you mean, and gets it ready to do.</p>
        <div><button className="btn btn-primary" onClick={onTry}><I n="mic" />Try it</button></div>
      </div>
      <div className="grid2">
        <div className="card box"><h3>The problem</h3><ul>
          <li><b>Hearing:</b> names come out wrong (“Mehta” as “Mahta”, “Lakshmi akka la”).</li>
          <li><b>Meaning:</b> “parso shaam”, “dhai sau”, “repu madhyanam” stay as words, not a date or ₹250.</li>
          <li><b>Who:</b> “Anna”, “Rahul”, “usko”: which person? There are two Rahuls.</li>
          <li><b>Intent:</b> “shift karwa do” needs a call to the clinic, not a summary.</li>
          <li><b>Safety:</b> “OTP bata do” should never be obeyed.</li></ul></div>
        <div className="card box"><h3>What Artha does</h3><ul>
          <li>Hints the speech model with your contacts’ names.</li>
          <li>Converts Indian dates, times and amounts with tested code.</li>
          <li>Finds who you mean by sound, nickname, relationship and recent activity, and asks once when two people fit.</li>
          <li>Writes each message in the <b>recipient’s</b> language.</li>
          <li>Blocks OTPs in code before any model sees them; money always needs your confirmation.</li>
          <li>Remembers your answers and changed plans.</li></ul></div>
      </div>
      <div className="card box"><h3>How it works</h3><div className="steps">
        {[['Hear', 'Transcription with name hints (OpenAI gpt-transcribe).'], ['Meaning', 'Code: script → Roman, then dates, times and amounts across Hindi, Marathi, Telugu, Tamil.'], ['Who', 'Code shortlists people by how names sound, case endings (Ammaki, Selvi-kku), nicknames and recent activity.'], ['Plan', 'One OpenAI call resolves people and plans actions in a fixed format. It can only pick saved contacts.'], ['Rules', 'Code: OTP block, money confirmation, no past times, saved contacts only.'], ['Learn', 'New facts and your answers saved per person (S3 on AWS).']].map(([b, s], i) => <div key={b} className="step"><span className="n">{i + 1}</span><div><b>{b}</b><span>{s}</span></div></div>)}
      </div></div>
      <div className="card box"><h3>Four people to test with</h3><div className="grid2">{personas.map(p => <div key={p.id} style={{ display: 'flex', gap: 10 }}><span className="av lg ink">{p.avatar}</span><div><b>{p.name}, {p.age} · {p.city}</b><div className="muted" style={{ fontSize: 13.5 }}>{p.about}</div></div></div>)}</div>
        <p className="muted" style={{ fontSize: 13 }}>Each has deliberately confusing contacts: two Rahuls, two Shankars, two Pawars, a Sharma customer and a Sharma supplier, two Rameshes.</p></div>
      <div className="card box"><h3>Honest note</h3><ul>
        <li><b>Built here this weekend:</b> the pipeline, transliteration, entity code, resolver, rules, memory, this app and the evaluation.</li>
        <li><b>Reused:</b> OpenAI models (transcription, planning, text-to-speech for test clips), React, Vite, AWS.</li>
        <li><b>Simulated:</b> the four people, their contacts and history are made up. Messages, calls and payments happen inside the app only; nothing is sent to real people or banks.</li></ul></div>
    </div>
  );
}
