import gsap from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { romanize } from '../../server/pipeline/translit';
import type { Action, Result, State } from '../../server/types';
import { api, type PersonaInfo, type Sample } from './api';
import { Orb, type OrbMode } from './Orb';
import { startRecording, type Recording } from './recorder';

/* ---------------- icons ---------------- */
const P: Record<string, string> = {
  mic: 'M9 3h6v12H9zM5 11a7 7 0 0 0 14 0M12 18v3', play: 'M7 4.5v15l13-7.5z', send: 'M4 12l16-8-6 16-3-7z', check: 'M5 12.5l4.5 4.5L19 7',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z', spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  brain: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 3v3M12 18v3M3 12h3M18 12h3', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', info: 'M12 8v.5M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  back: 'M15 5l-7 7 7 7', call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  cal: 'M3.5 5h17v15h-17zM3.5 10h17M8 3v4M16 3v4', rupee: 'M7 5h10M7 9h10M7 5c5 0 7 2 7 4s-2 4-7 4l7 7', book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  x: 'M6 6l12 12M18 6L6 18', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', keyboard: 'M3 6h18v12H3zM7 10h.5M11 10h.5M15 10h.5M7 14h10',
  vs: 'M4 5l4 14 4-14M14 17c1 1.5 2.5 2 4 2 2 0 3-1 3-2.5 0-3.5-7-2-7-6 0-1.5 1.2-2.5 3-2.5 1.4 0 2.6.5 3.5 1.5',
};
const I = ({ n, s }: { n: string; s?: React.CSSProperties }) => <svg className="ico" viewBox="0 0 24 24" style={s} aria-hidden="true"><path d={P[n]} /></svg>;
const ACT_ICON: Record<string, string> = { message: 'chat', call: 'call', reminder: 'bell', calendar: 'cal', payment: 'rupee', ledger: 'book', suggestion: 'spark' };

/* ---------------- types & helpers ---------------- */
type Tab = 'artha' | 'chats' | 'memory' | 'results' | 'about';
type Run = {
  id: number; source: 'mic' | 'sample' | 'typed'; label?: string; audio?: Blob; audioUrl?: string; synthetic?: boolean;
  stage: number; transcript?: string; hearMs?: number; result?: Result; error?: string; startedAt: number; endedAt?: number;
  done: Record<number, string>; busy?: number | null; confirm?: number | null; working?: boolean;
  compare?: { loading: boolean; baseHeard?: string; base?: Result; ctx?: Result; error?: string };
};
let seq = 0;
const nonLatin = (s: string) => /[ऀ-෿]/.test(s);
const first = (n?: string) => n?.split(' ')[0] ?? '';
const fmtTime = (iso: string) => { const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
const initials = (n: string) => n.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '·';
function useEnter<T extends HTMLElement>(dep?: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (!ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => gsap.from(ref.current!.children, { y: 14, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'all' }), ref);
    return () => ctx.revert();
  }, [dep]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** Find the original-script words behind a romanised phrase ("parson shaam" → "परसों शाम"). */
function origOf(orig: string, phrase: string): string {
  const clean = (w: string) => romanize(w).toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = orig.split(/\s+/); const target = phrase.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ''));
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((t, k) => clean(words[i + k]) === t)) return words.slice(i, i + target.length).join(' ').replace(/[,.!?।]+$/, '');
  }
  return phrase;
}

/** Underline the words Artha understood, inside the sentence. */
function Highlight({ text, marks }: { text: string; marks: { text: string; cls: string; label: string }[] }) {
  const out: React.ReactNode[] = []; let rest = text; let k = 0;
  const lower = text.toLowerCase();
  const ms = marks.filter(m => m.text && lower.includes(m.text.toLowerCase())).sort((a, b) => lower.indexOf(a.text.toLowerCase()) - lower.indexOf(b.text.toLowerCase()));
  for (const m of ms) {
    const i = rest.toLowerCase().indexOf(m.text.toLowerCase()); if (i < 0) continue;
    if (i) out.push(rest.slice(0, i));
    out.push(<span key={k++} className={`ent ${m.cls}`}>{rest.slice(i, i + m.text.length)}<sub>{m.label}</sub></span>);
    rest = rest.slice(i + m.text.length);
  }
  out.push(rest);
  return <>{out}</>;
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
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [rec, setRec] = useState<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const feed = useRef<HTMLDivElement>(null);

  const persona = personas.find(p => p.id === pid);
  const myRuns = runs[pid] ?? [];
  const busy = myRuns.some(r => !r.result && !r.error);
  const orbMode: OrbMode = rec ? 'listening' : busy ? 'thinking' : myRuns.at(-1)?.result ? 'done' : 'idle';
  const say = useCallback((t: string) => { setToast(t); window.clearTimeout((say as any)._t); (say as any)._t = window.setTimeout(() => setToast(''), 2400); }, []);

  useEffect(() => { api.personas().then(setPersonas).catch(e => say(e.message)); api.samples().then(setSamples); }, [say]);
  useEffect(() => { try { localStorage.setItem('artha.p', pid); } catch { /* private mode */ } setPstate(null); setOpenChat(null); api.state(pid).then(setPstate).catch(e => say(e.message)); }, [pid, say]);
  // ?p=imran&say=... runs a typed note on load (handy for demos and screenshots)
  const autoRan = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('p') && q.get('p') !== pid && personas.some(x => x.id === q.get('p'))) { setPid(q.get('p')!); return; }
    if (!autoRan.current && pstate && personas.length && q.get('say')) { autoRan.current = true; fromText(q.get('say')!); }
  }, [personas, pstate]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrollDown = () => requestAnimationFrame(() => setTimeout(() => feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }), 60));

  const update = useCallback((id: number, patch: Partial<Run> | ((r: Run) => Partial<Run>)) => {
    setRuns(all => ({ ...all, [pid]: (all[pid] ?? []).map(r => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)) }));
  }, [pid]);
  const applyState = (s: State) => setPstate(prev => {
    if (prev) { const old = new Set(prev.memory.map(m => m.fact)); const add = s.memory.filter(m => !old.has(m.fact)).map(m => m.fact); if (add.length) setFresh(f => new Set([...f, ...add])); }
    return s;
  });

  /* ---------- the pipeline ---------- */
  async function process(run: Run) {
    setRuns(all => ({ ...all, [pid]: [...(all[pid] ?? []), run] }));
    setTab('artha'); scrollDown();
    try {
      let transcript = run.transcript ?? '';
      if (run.audio) {
        const h = await api.transcribe(pid, run.audio, 'artha');
        transcript = h.text;
        update(run.id, { transcript, hearMs: h.ms, stage: 1 });
        if (!transcript) throw new Error('Nothing was heard. Try again a little closer.');
      } else update(run.id, { stage: 1 });
      const t1 = setTimeout(() => update(run.id, r => (r.stage < 2 ? { stage: 2 } : {})), 300);
      const t2 = setTimeout(() => update(run.id, r => (r.stage < 3 ? { stage: 3 } : {})), 700);
      const out = await api.understand(pid, transcript, 'artha');
      clearTimeout(t1); clearTimeout(t2);
      update(run.id, { result: out.result, stage: 4, endedAt: Date.now() });
      applyState(out.state); scrollDown();
    } catch (e: any) { update(run.id, { error: e.message, stage: 4, endedAt: Date.now() }); }
  }
  const fromAudio = (audio: Blob, source: Run['source'], label?: string, synthetic?: boolean) =>
    process({ id: ++seq, source, label, audio, audioUrl: URL.createObjectURL(audio), synthetic, stage: 0, done: {}, startedAt: Date.now() });
  const fromText = (text: string) => process({ id: ++seq, source: 'typed', transcript: text, stage: 0, done: {}, startedAt: Date.now() });
  async function playSample(s: Sample) {
    try { const b = await (await fetch(`/clips/${s.file}`)).blob(); fromAudio(b, 'sample', s.label, s.synthetic); } catch { say('Could not load that sample.'); }
  }

  async function act(run: Run, i: number, confirmed = false) {
    const a = run.result!.actions[i];
    if (a.type === 'payment' && !confirmed) { update(run.id, { confirm: i }); return; }
    update(run.id, { busy: i });
    try { const r = await api.act(pid, a, confirmed); applyState(r.state); update(run.id, x => ({ done: { ...x.done, [i]: r.done }, busy: null, confirm: null })); }
    catch (e: any) { update(run.id, { busy: null }); say(e.message); }
  }
  const skip = (run: Run, i: number) => update(run.id, x => ({ done: { ...x.done, [i]: 'Skipped' }, confirm: null }));
  async function doAll(run: Run) { for (const [i, a] of run.result!.actions.entries()) if (['message', 'calendar', 'reminder', 'ledger'].includes(a.type) && !run.done[i]) await act(run, i); }
  /** One tap to pick someone else: Artha re-plans and quietly remembers. No question asked. */
  async function choose(run: Run, mention: string, contactId: string, how: 'asked' | 'changed') {
    update(run.id, { working: true });
    try {
      const a = await api.answer(pid, mention, contactId, run.result?.topics?.[0], how); applyState(a.state);
      const out = await api.understand(pid, run.transcript ?? run.result!.transcript, 'artha', { [mention]: contactId });
      update(run.id, { result: out.result, working: false, done: {} }); applyState(out.state);
      say(`Got it. Next time “${mention}” means ${persona?.contacts.find(c => c.id === contactId)?.name}.`);
    } catch (e: any) { update(run.id, { working: false, error: e.message }); }
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
  async function reset() { const r = await api.reset(pid); setPstate(r.state); setRuns(all => ({ ...all, [pid]: [] })); setFresh(new Set()); say(`${first(persona?.name)} is back to the start`); }

  /* ---------- the orb is the mic: hold to talk, or tap to start and tap to stop ---------- */
  const pressedAt = useRef(0); const starting = useRef(false); const timer = useRef<number>();
  async function startRec() {
    if (rec || starting.current || busy) return; starting.current = true;
    try { const r = await startRecording(setLevel); setRec(r); timer.current = window.setTimeout(() => stopRec(r), 45000); }
    catch { say('Allow the microphone, or type instead.'); } finally { starting.current = false; }
  }
  async function stopRec(r = rec) {
    if (!r) return; window.clearTimeout(timer.current); setRec(null);
    const b = await r.stop(); if (b.size > 2500) fromAudio(b, 'mic'); else say('Hold the orb while you speak.');
  }
  const orbDown = (e: React.PointerEvent) => { e.preventDefault(); pressedAt.current = Date.now(); rec ? stopRec() : startRec(); };
  const orbUp = () => { if (rec && Date.now() - pressedAt.current > 450) stopRec(); };

  const mySamples = samples.filter(s => s.persona === pid).slice(0, 4);
  const unread = useMemo(() => pstate ? Object.values(pstate.threads).filter(t => t.at(-1)?.via && Date.now() - Date.parse(t.at(-1)!.at) < 10 * 60e3).length : 0, [pstate]);
  const go = (t: Tab) => { setTab(t); };
  const wide = tab === 'results' || tab === 'about';
  const empty = myRuns.length === 0;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><img className="logo" src="/icon.svg" alt="" /><b>Artha</b></div>
        <nav className="topnav" aria-label="Views">
          {([['artha', 'Artha'], ['chats', 'Chats'], ['results', 'Results'], ['about', 'About']] as const).map(([t, l]) => (
            <button key={t} className={t === 'chats' ? 'only-mid' : ''} aria-current={tab === t || (t === 'artha' && tab === 'memory') ? 'page' : undefined} onClick={() => go(t)}>{l}</button>))}
        </nav>
        {persona && <button className="who-btn" onClick={() => setMenu(true)} aria-label={`Testing as ${persona.name}. Switch person`}><span className="av ink">{persona.avatar}</span><span className="nm">{first(persona.name)}</span><I n="swap" s={{ width: 14, height: 14, opacity: .6 }} /></button>}
      </header>

      <main className="main" data-tab={tab}>
        {wide ? <div className="page">{tab === 'results' ? <Results /> : <About personas={personas} onTry={() => go('artha')} />}</div> : (<>
          <section className="pane pane-chats" aria-label="Chats">
            <Chats persona={persona} state={pstate} open={openChat} setOpen={setOpenChat} onSwitch={() => setMenu(true)} />
          </section>

          <section className={`pane pane-thread ${empty ? 'is-empty' : ''}`} aria-label="Artha">
            <div className="feed" ref={feed}>
              {empty && (
                <div className="hero-copy">
                  <h1>Bas ishaara<br />kaafi hai.</h1>
                  <p>{rec ? 'Listening… release to send' : 'Hold the orb and speak'}</p>
                  {mySamples.length > 0 && !rec && (
                    <div className="pills">{mySamples.map(s => <button key={s.id} className="pill" onClick={() => playSample(s)}><I n="play" s={{ width: 11, height: 11, fill: 'currentColor', stroke: 'none' }} />{s.label}</button>)}</div>)}
                </div>)}
              {myRuns.map(r => <Note key={r.id} run={r} persona={persona} onAct={act} onSkip={skip} onAll={doAll} onChoose={choose} onCompare={compare} />)}
              {!empty && mySamples.length > 0 && !busy && (
                <div className="pills tail">{mySamples.map(s => <button key={s.id} className="pill" onClick={() => playSample(s)}><I n="play" s={{ width: 11, height: 11, fill: 'currentColor', stroke: 'none' }} />{s.label}</button>)}</div>)}
            </div>
            <div className={`orb-wrap ${empty ? 'hero' : 'docked'} ${rec ? 'rec' : ''}`}>
              <button className="orb-btn" onPointerDown={orbDown} onPointerUp={orbUp} onPointerLeave={orbUp} onContextMenu={e => e.preventDefault()}
                aria-label={rec ? 'Stop and send' : 'Hold to speak'} disabled={busy && !rec}>
                <span className="halo" /><Orb mode={orbMode} level={level} />
              </button>
            </div>
            <TypeBar onText={fromText} disabled={busy} />
          </section>

          <aside className="pane pane-side" aria-label="What Artha knows">
            <Knows persona={persona} state={pstate} fresh={fresh} onReset={reset} />
          </aside>
        </>)}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {([['artha', 'spark', 'Artha'], ['chats', 'chat', 'Chats'], ['memory', 'brain', 'Knows'], ['results', 'chart', 'Results'], ['about', 'info', 'About']] as const).map(([t, ic, l]) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}><I n={ic} />{l}{((t === 'chats' && unread > 0) || (t === 'memory' && fresh.size > 0 && tab !== 'memory')) && <span className="dot" />}</button>))}
      </nav>

      {menu && (
        <div className="menu-bg" onClick={() => setMenu(false)}>
          <div className="menu" role="dialog" aria-label="Choose who to test as" onClick={e => e.stopPropagation()}>
            <h4>Test as</h4>
            {personas.map(p => (
              <button key={p.id} aria-current={p.id === pid} onClick={() => { setPid(p.id); setMenu(false); setTab('artha'); }}>
                <span className="av lg ink">{p.avatar}</span><span><b>{p.name}</b><small>{p.city} · {p.speaks.join(', ')}</small></span>
              </button>))}
          </div>
        </div>)}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ================= one voice note ================= */
function Note({ run, persona, onAct, onSkip, onAll, onChoose, onCompare }: {
  run: Run; persona?: PersonaInfo; onAct: (r: Run, i: number, confirmed?: boolean) => void; onSkip: (r: Run, i: number) => void;
  onAll: (r: Run) => void; onChoose: (r: Run, mention: string, id: string, how: 'asked' | 'changed') => void; onCompare: (r: Run) => void;
}) {
  const res = run.result;
  const [how, setHow] = useState(false);
  const ref = useEnter<HTMLElement>(!!res);
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = () => { if (!run.audioUrl) return; audio.current?.pause(); audio.current = new Audio(run.audioUrl); audio.current.play().catch(() => {}); };
  const heard = res?.transcript ?? run.transcript ?? '';
  const shown = res?.transcript ?? heard;
  const marks = res ? [
    ...res.mentions.filter(m => m.kind === 'person' && m.candidates.length).map(m => ({ text: m.text, cls: 'person', label: [...m.candidates].sort((a, b) => b.score - a.score)[0].name })),
    ...res.entities.map(e => ({ text: nonLatin(res.transcript) ? origOf(res.transcript, e.text) : e.text, cls: e.kind, label: e.label.replace(/^.*→ /, '') })),
  ] : [];
  const safeLeft = res?.actions.filter((a, i) => ['message', 'calendar', 'reminder', 'ledger'].includes(a.type) && !run.done[i]).length ?? 0;
  const secs = run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) : null;
  const contact = (id: string) => persona?.contacts.find(x => x.id === id);

  return (
    <article className="note" ref={ref}>
      <div className="me">
        {run.source !== 'typed' && <button className="play" onClick={play} aria-label="Play the voice note"><I n="play" /></button>}
        <span className="said">{heard ? shown : run.source === 'sample' ? run.label : '…'}</span>
      </div>

      {!res && !run.error && <Progress stage={run.stage} />}
      {run.error && <p className="err">{run.error}</p>}

      {res && <>
        {res.blocked ? (
          <div className="card blocked"><I n="shield" /><div><b>Never shared. An OTP stays with you.</b><span>Hidden before any AI saw it.</span></div></div>
        ) : (
          <p className="understood"><Highlight text={shown} marks={marks} /></p>
        )}

        {res.clarify && (
          <div className="clar"><b>{res.clarify.question}</b>
            <div className="opts">{res.clarify.options.map(o => <button key={o.id} className="btn btn-ghost" disabled={run.working} onClick={() => onChoose(run, res.clarify!.mention, o.id, 'asked')}>{o.label}<small>{contact(o.id)?.rel}</small></button>)}</div>
          </div>)}

        {res.actions.length > 0 && (
          <div className="acts">
            {res.actions.map((a, i) => <ActionCard key={`${i}-${a.contact_id}`} a={a} done={run.done[i]} busy={run.busy === i || !!run.working} confirming={run.confirm === i} contact={contact(a.contact_id)}
              onDo={() => onAct(run, i)} onConfirm={() => onAct(run, i, true)} onSkip={() => onSkip(run, i)} onChange={id => onChoose(run, a.mention ?? a.contact_name, id, 'changed')} />)}
            {safeLeft > 1 && <button className="btn btn-primary doall" onClick={() => onAll(run)}><I n="check" />Do all</button>}
          </div>)}

        <div className="foot">
          <span className="dim">{secs ? `${secs}s` : ''}</span>
          <button className={`foot-btn ${run.compare ? 'on' : ''}`} onClick={() => (run.compare ? null : onCompare(run))}><I n="vs" />Base model</button>
          <button className={`foot-btn ${how ? 'on' : ''}`} onClick={() => setHow(h => !h)}><I n="eye" />How</button>
        </div>
        {run.compare && <Compare cmp={run.compare} />}
        {how && <How run={run} res={res} />}
      </>}
    </article>
  );
}

function Progress({ stage }: { stage: number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bar.current) gsap.to(bar.current, { scaleX: Math.min(1, (stage + 0.6) / 4), duration: 0.9, ease: 'power2.out' }); }, [stage]);
  return (
    <div className="progress" aria-label="Working">
      <div className="track"><div className="fill" ref={bar} /></div>
      <div className="labels">{['Heard', 'Meaning', 'Who', 'Plan'].map((l, i) => <span key={l} className={i < stage ? 'done' : i === stage ? 'now' : ''}>{l}</span>)}</div>
    </div>
  );
}

function ActionCard({ a, done, busy, confirming, contact, onDo, onConfirm, onSkip, onChange }: {
  a: Action; done?: string; busy: boolean; confirming: boolean; contact?: { name: string; rel: string; lang: string; upi?: string };
  onDo: () => void; onConfirm: () => void; onSkip: () => void; onChange: (id: string) => void;
}) {
  const [alts, setAlts] = useState(false);
  const [why, setWhy] = useState(false);
  const who = a.contact_name || contact?.name;
  const title = { message: who, call: `Call ${who}`, reminder: a.title || 'Reminder', calendar: a.title || 'Calendar', payment: `Pay ${who}`, ledger: `${who}’s khata`, suggestion: a.title || 'Suggestion' }[a.type];
  const verb = { message: 'Send', call: 'Let Artha call', reminder: 'Remind me', calendar: 'Add', payment: `Pay ₹${a.amount_inr.toLocaleString('en-IN')}`, ledger: `Add ₹${a.amount_inr.toLocaleString('en-IN')}`, suggestion: 'Yes' }[a.type];
  const body = a.type === 'message' ? a.text : a.type === 'call' ? a.goal || a.text : a.type === 'ledger' ? (a.title || a.text) : '';
  const when = (a.type === 'reminder' || a.type === 'calendar' || a.type === 'call') ? a.when_label : '';
  return (
    <div className={`act ${done ? 'done' : ''} ${a.type}`}>
      <div className="act-h">
        <span className={`act-i ${a.type}`}><I n={ACT_ICON[a.type]} /></span>
        <div className="act-t"><b>{title}</b>{when && <span>{when}</span>}{a.type === 'payment' && <span>₹{a.amount_inr.toLocaleString('en-IN')} · UPI</span>}</div>
        {a.type === 'message' && a.language && <span className="chip accent">{a.language}</span>}
        {a.predicted && <span className="chip amber">Predicted</span>}
        {!done && a.alternatives && a.alternatives.length > 0 && <button className="icon-btn" onClick={() => setAlts(x => !x)} aria-label="Someone else?"><I n="swap" /></button>}
      </div>
      {alts && !done && <div className="alts"><span>Not {first(who)}?</span>{a.alternatives!.map(x => <button key={x.id} className="pill" onClick={() => { setAlts(false); onChange(x.id); }}>{x.name}</button>)}</div>}
      {body && <p className="act-body">{body}{a.gloss && a.type === 'message' && <small>{a.gloss}</small>}</p>}
      {why && a.why && <p className="act-why">{a.why}</p>}
      {done ? <div className="ok"><I n="check" />{done}</div>
        : confirming ? <div className="act-btns"><span className="confirm">Pay ₹{a.amount_inr.toLocaleString('en-IN')} to {who}? Demo only.</span><button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={busy}>Confirm</button><button className="btn btn-ghost btn-sm" onClick={onSkip}>Cancel</button></div>
        : <div className="act-btns"><button className="btn btn-primary btn-sm" onClick={onDo} disabled={busy}>{busy ? '…' : verb}</button>{a.why && <button className="icon-btn sm" onClick={() => setWhy(x => !x)} aria-label="Why?"><I n="info" /></button>}<button className="link" onClick={onSkip}>{a.type === 'suggestion' ? 'No' : 'Skip'}</button></div>}
    </div>
  );
}

function Compare({ cmp }: { cmp: NonNullable<Run['compare']> }) {
  const ref = useEnter<HTMLDivElement>(cmp.loading);
  if (cmp.loading) return <Progress stage={2} />;
  if (cmp.error) return <p className="err">{cmp.error}</p>;
  const col = (title: string, r?: Result, heard?: string) => (
    <div className="cmp"><h5>{title}</h5>
      {heard !== undefined && <p className="dim">“{heard}”</p>}
      {r && r.actions.length ? r.actions.map((a, i) => <p key={i}><b>{a.type}</b>{a.contact_name ? ` → ${a.contact_name}` : ''}{a.text ? ` · ${a.text}` : ''}{a.when_label ? ` · ${a.when_label}` : ''}{a.amount_inr ? ` · ₹${a.amount_inr}` : ''}</p>) : <p className="dim">No actions</p>}
    </div>);
  return <div className="compare" ref={ref}>{col('Base model', cmp.base, cmp.baseHeard)}{col('Base + pasted context', cmp.ctx)}</div>;
}

function How({ run, res }: { run: Run; res: Result }) {
  const ref = useEnter<HTMLDivElement>();
  const rows: [string, string, React.ReactNode][] = [
    ['Hear', 'AI', run.source === 'typed' ? 'Typed' : `${run.hearMs} ms, with contact names as hints`],
    ['Meaning', 'Code', res.entities.length ? res.entities.map(e => `${e.text} → ${e.label}`).join(' · ') : '—'],
    ['Who', 'Code + AI', res.mentions.filter(m => m.kind === 'person').map(m => { const c = [...m.candidates].sort((a, b) => b.score - a.score); return `${nonLatin(m.text) ? romanize(m.text) : m.text} → ${c.map(x => `${x.name} ${Math.round(x.score * 100)}%`).slice(0, 2).join(', ')}`; }).join(' · ') || '—'],
    ['Context', 'Code', `${res.topics?.length ? `Topic: ${res.topics.join(', ').replace(/_/g, ' ')}. ` : ''}${res.candidates.slice(0, 3).map(c => `${c.name}: ${c.why}`).join(' · ')}`],
    ['Rules', 'Code', res.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.rule}`).join(' · ')],
    ['Learn', 'Code', res.learn.join(' · ') || '—'],
  ];
  return <div className="how" ref={ref}>{rows.map(([n, k, v]) => <div key={n} className="how-r"><b>{n}<span className={`chip ${k === 'Code' ? '' : 'accent'}`}>{k}</span></b><span>{v}</span></div>)}</div>;
}

function TypeBar({ onText, disabled }: { onText: (t: string) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  return (
    <form className="typebar" onSubmit={e => { e.preventDefault(); if (text.trim() && !disabled) { onText(text.trim()); setText(''); } }}>
      <I n="keyboard" s={{ color: 'var(--dim)' }} />
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Or type: “Rahul ko bolo kal 4 baje”" aria-label="Type a note" />
      {text.trim() && <button className="send" aria-label="Send" disabled={disabled}><I n="send" /></button>}
    </form>
  );
}

/* ================= chats ================= */
function Chats({ persona, state, open, setOpen, onSwitch }: { persona?: PersonaInfo; state: State | null; open: string | null; setOpen: (id: string | null) => void; onSwitch: () => void }) {
  if (!persona || !state) return null;
  if (open) {
    const c = persona.contacts.find(x => x.id === open)!;
    return (<>
      <div className="thread-head"><button className="icon-btn" onClick={() => setOpen(null)} aria-label="Back"><I n="back" /></button><span className="av">{initials(c.name)}</span><div><b>{c.name}</b><small>{c.rel} · {c.lang}</small></div></div>
      <div className="bubbles">{(state.threads[c.id] ?? []).map((m, i) => <div key={i} className={`bub ${m.me ? 'me' : 'them'}`}>{m.via && <span className="via">{m.via}</span>}{m.text}<time>{fmtTime(m.at)}</time></div>)}</div>
    </>);
  }
  return (<>
    <button className="pc-head" onClick={onSwitch}><span className="av lg ink">{persona.avatar}</span><span><b>{persona.name}</b><small>{persona.city} · {persona.speaks.join(', ')}</small></span><I n="swap" s={{ marginLeft: 'auto', opacity: .5 }} /></button>
    {persona.contacts.map(c => {
      const last = (state.threads[c.id] ?? []).at(-1);
      const isNew = !!last?.via && Date.now() - Date.parse(last.at) < 10 * 60e3;
      return (
        <button key={c.id} className={`chatrow ${isNew ? 'unread' : ''}`} onClick={() => setOpen(c.id)}>
          <span className="av">{initials(c.name)}</span>
          <span className="t"><span className="n"><span>{c.name}</span><span>{last ? fmtTime(last.at) : ''}</span></span><span className="l">{last ? `${last.me ? 'You: ' : ''}${last.text}` : c.rel}</span></span>
        </button>);
    })}
  </>);
}

/* ================= what Artha knows ================= */
function Knows({ persona, state, fresh, onReset }: { persona?: PersonaInfo; state: State | null; fresh: Set<string>; onReset: () => void }) {
  const [all, setAll] = useState(false);
  const listRef = useEnter<HTMLDivElement>(state?.memory.length);
  if (!state || !persona) return null;
  const facts = [...state.memory].sort((a, b) => Number(!!b.learned) - Number(!!a.learned));
  const shown = all ? facts : facts.slice(0, 6);
  const upcoming = [...state.calendar.filter(c => Date.parse(c.when_iso) > Date.now() - 36e5), ...state.reminders.map(r => ({ title: r.title, when_label: r.when_label, when_iso: r.when_iso, added: true }))]
    .sort((a, b) => Date.parse(a.when_iso) - Date.parse(b.when_iso)).slice(0, 4);
  const owed = Object.entries(state.ledger.reduce<Record<string, number>>((m, l) => ({ ...m, [l.contact]: (m[l.contact] ?? 0) + l.amount }), {}));
  return (<>
    <div className="knows-h"><h3>Artha knows</h3><span className="big">{state.memory.length}</span></div>
    <div className="facts" ref={listRef}>{shown.map(m => (
      <div key={m.fact} className={`fact ${m.learned ? 'learned' : ''} ${fresh.has(m.fact) ? 'fresh' : ''}`}><I n={m.kind === 'alias' ? 'swap' : m.learned ? 'spark' : 'brain'} /><span>{m.fact}</span></div>))}
      {facts.length > 6 && <button className="link" onClick={() => setAll(x => !x)}>{all ? 'Show less' : `+${facts.length - 6} more`}</button>}
    </div>
    {upcoming.length > 0 && <div className="mini"><h4>Coming up</h4>{upcoming.map((c, i) => <div key={i} className={c.added ? 'added' : ''}><span>{c.title}</span><span>{c.when_label}</span></div>)}</div>}
    {owed.length > 0 && <div className="mini"><h4>Khata</h4>{owed.map(([c, amt]) => <div key={c}><span>{persona.contacts.find(x => x.id === c)?.name}</span><span>₹{amt.toLocaleString('en-IN')}</span></div>)}</div>}
    <button className="link reset" onClick={onReset}><I n="refresh" />Start {first(persona.name)} over</button>
  </>);
}

/* ================= results ================= */
function Count({ v }: { v: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => { const o = { n: 0 }; gsap.to(o, { n: v, duration: 1.2, ease: 'power3.out', onUpdate: () => { if (el.current) el.current.textContent = `${Math.round(o.n)}%`; } }); }, [v]);
  return <span ref={el}>0%</span>;
}
function Results() {
  const [data, setData] = useState<any>(undefined);
  useEffect(() => { api.results().then(setData).catch(() => setData(null)); }, []);
  const ref = useEnter<HTMLDivElement>(data);
  const SYS = [['base', 'Base model'], ['base_ctx', '+ pasted context'], ['artha', 'Artha']] as const;
  const METRICS = [['whole', 'Whole note right'], ['contact', 'Right person'], ['values', 'Dates & amounts exact'], ['intent', 'Right action'], ['names', 'Names heard right'], ['safety', 'Safety handled']] as const;
  return (
    <div className="wrap" ref={ref}>
      <div className="page-h"><h1>Same recordings.<br />Base model vs Artha.</h1></div>
      {data === undefined && <p className="muted">Loading…</p>}
      {data === null && <p className="muted">No results yet. Run <span className="mono">npm run eval</span>.</p>}
      {data && <>
        <div className="kpis">{METRICS.slice(0, 3).map(([m, l]) => (
          <div key={m} className="kpi"><span className="kpi-l">{l}</span><span className="kpi-v"><Count v={Math.round((data.systems.artha?.[m] ?? 0) * 100)} /></span><span className="kpi-b">base {Math.round((data.systems.base?.[m] ?? 0) * 100)}%</span></div>))}
        </div>
        <div className="card tbl"><table className="t">
          <thead><tr><th>{data.cases} clips</th>{SYS.map(([k, l]) => <th key={k} className="n">{l}</th>)}</tr></thead>
          <tbody>{METRICS.map(([m, l]) => {
            const vals = SYS.map(([k]) => data.systems?.[k]?.[m]); const best = Math.max(...vals.filter((x: any) => typeof x === 'number'));
            return <tr key={m}><td>{l}</td>{vals.map((x: any, i: number) => <td key={i} className="n">{typeof x === 'number' ? <div className="barcell"><span className={x === best && SYS[i][0] === 'artha' ? 'best' : ''}>{Math.round(x * 100)}%</span><div className="hbar"><i style={{ width: `${Math.round(x * 100)}%`, background: SYS[i][0] === 'artha' ? 'var(--accent)' : 'var(--line-2)' }} /></div></div> : '—'}</td>)}</tr>;
          })}<tr><td>Seconds per note</td>{SYS.map(([k]) => <td key={k} className="n">{data.systems?.[k]?.median_s ?? '—'}</td>)}</tr></tbody>
        </table></div>
        <p className="dim small">{data.personas} people · {data.languages?.join(', ')} · {data.synthetic} synthetic voices · {data.model} · {new Date(data.generatedAt).toLocaleString('en-IN')}</p>
        <details className="card cases"><summary>Every clip</summary>
          <div className="tbl"><table className="t"><tbody>{data.perCase?.map((c: any) => <tr key={c.id}><td><b>{c.persona}</b> <span className="dim">{c.lang}</span><div>{c.text}</div></td>{SYS.map(([k]) => <td key={k} className="n">{c.whole?.[k] ? <span className="best">✓</span> : <span className="bad">✗</span>}</td>)}</tr>)}</tbody></table></div>
        </details>
      </>}
    </div>
  );
}

/* ================= about ================= */
function About({ personas, onTry }: { personas: PersonaInfo[]; onTry: () => void }) {
  const ref = useEnter<HTMLDivElement>();
  return (
    <div className="wrap" ref={ref}>
      <div className="page-h"><span className="eyebrow">अर्थ · అర్థం · அர்த்தம் · meaning</span><h1>Speech models hear words.<br />Artha understands what you mean.</h1></div>
      <div className="grid3">
        <div className="card box"><h3>The gap</h3><p>“Anna ko bol do, Mehta ji wala appointment parso shaam shift karwa do.” Which Anna? Which Mehta? When is parso? A base model can’t tell.</p></div>
        <div className="card box"><h3>Artha</h3><p>Looks up your people, their language, your recent calls and habits. Acts on its best guess and offers a one-tap change, so it rarely needs to ask.</p></div>
        <div className="card box"><h3>Safe by code</h3><p>OTPs are blocked before any AI sees them. Money always waits for you. Only saved contacts.</p></div>
      </div>
      <div className="flow">{['Hear', 'Meaning', 'Who', 'Plan', 'Rules', 'Learn'].map((s, i) => <span key={s}><b>{i + 1}</b>{s}</span>)}</div>
      <div className="people">{personas.map(p => <div key={p.id}><span className="av lg ink">{p.avatar}</span><b>{first(p.name)}</b><small>{p.city} · {p.speaks.join(', ')}</small></div>)}</div>
      <div className="card box honest"><h3>Honest note</h3><p>Built this weekend: the pipeline, knowledge base, rules, app and eval. Reused: OpenAI models, React, Three.js, GSAP, AWS. Simulated: the four people and their histories. Messages, calls and payments stay inside the app.</p></div>
      <div><button className="btn btn-primary" onClick={onTry}><I n="spark" />Try Artha</button></div>
    </div>
  );
}
