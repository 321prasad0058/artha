import gsap from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { romanize } from '../../server/pipeline/translit';
import type { Action, Result, State } from '../../server/types';
import { API_BASE, api, type PersonaInfo, type Sample, type Scan } from './api';
import { Orb, type OrbMode } from './Orb';
import { Intro, shouldShowIntro } from './Intro';
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
  speak: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11', mute: 'M4 10v4h4l5 4V6L8 10zM17 9l5 6M22 9l-5 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0', box: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10', pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8', alert: 'M12 3l10 18H2zM12 10v5M12 18v.5', chev: 'M6 9l6 6 6-6', ask: 'M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5V14M12 17.5v.5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  vs: 'M4 5l4 14 4-14M14 17c1 1.5 2.5 2 4 2 2 0 3-1 3-2.5 0-3.5-7-2-7-6 0-1.5 1.2-2.5 3-2.5 1.4 0 2.6.5 3.5 1.5',
};
const I = ({ n, s }: { n: string; s?: React.CSSProperties }) => <svg className="ico" viewBox="0 0 24 24" style={s} aria-hidden="true"><path d={P[n]} /></svg>;
const ACT_ICON: Record<string, string> = { message: 'chat', call: 'call', reminder: 'bell', calendar: 'cal', payment: 'rupee', ledger: 'book', suggestion: 'spark' };

/* ---------------- types & helpers ---------------- */
type Tab = 'artha' | 'chats' | 'memory' | 'results' | 'about';
type Run = {
  image?: string; scan?: Scan;
  /** ms from letting go of the orb (or pressing send) to each moment the person notices */
  times?: { heard?: number; gist?: number; voice?: number; cards?: number };
  gist?: { gist: string; points: { kind: string; text: string }[] };
  id: number; source: 'mic' | 'sample' | 'typed' | 'photo'; label?: string; audio?: Blob; audioUrl?: string; synthetic?: boolean;
  stage: number; transcript?: string; hearMs?: number; result?: Result; error?: string; startedAt: number; endedAt?: number; replyUrl?: string;
  done: Record<number, string>; busy?: number | null; confirm?: number | null; working?: boolean;
  compare?: { loading: boolean; baseHeard?: string; base?: Result; ctx?: Result; error?: string };
};
let seq = 0;
const SHOW_TIMES = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
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
/** Shrink a photo on the phone before upload: long side <= max px, JPEG. A 4 MB camera photo becomes ~250 KB. */
function shrink(file: File, max: number, q: number): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => rej(new Error('Could not open that photo'));
    img.src = URL.createObjectURL(file);
  });
}
const POINT_ICON: Record<string, string> = { person: 'user', when: 'cal', money: 'rupee', item: 'box', task: 'check', place: 'pin', question: 'ask' };
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** What you said: a one-line gist and labelled points. The full transcript, with what Artha understood marked, is one tap away. */
function Heard({ run, res, shown, marks }: { run: Run; res?: Result; shown: string; marks: { text: string; cls: string; label: string }[] }) {
  const [full, setFull] = useState(false);
  const chips = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = () => { if (!run.audioUrl) return; audio.current?.pause(); audio.current = new Audio(run.audioUrl); audio.current.play().catch(() => {}); };
  const h = res?.heard ?? run.gist;
  useLayoutEffect(() => { if (h && chips.current) gsap.from(chips.current.children, { y: 8, opacity: 0, scale: .96, duration: .45, stagger: .06, ease: 'power3.out' }); }, [!!h]);
  return (
    <div className={`me ${h ? 'has-gist' : ''} ${run.image ? 'photo' : ''}`}>
      <div className="me-top">
        {run.image && <img className="thumb" src={run.image} alt="Your photo" />}
        {!run.image && run.source !== 'typed' && <button className="play" onClick={play} aria-label="Play the voice note"><I n="play" /></button>}
        <div className="me-text">
          <span className="me-k">{run.image ? 'Your photo' : run.source === 'typed' ? 'You typed' : 'You said'}</span>
          {h ? <b className="gist">{h.gist}</b> : <span className="said">{shown || (run.image ? 'Reading the photo…' : run.source === 'sample' ? run.label : '…')}</span>}
        </div>
      </div>
      {h && h.points.length > 0 && <div className="points" ref={chips}>{h.points.map((p, i) => <span key={i} className={`pt ${p.kind}`}><I n={POINT_ICON[p.kind] ?? 'spark'} />{p.text}</span>)}</div>}
      {h && !run.image && shown && <>
        <button className="full-t" onClick={() => setFull(f => !f)} aria-expanded={full}>{full ? 'Hide full note' : 'Full note'}<I n="chev" s={{ transform: full ? 'rotate(180deg)' : 'none' }} /></button>
        {full && <p className="understood"><Highlight text={shown} marks={marks} /></p>}
      </>}
    </div>
  );
}

const KIND_UI: Record<string, [string, string]> = { sale: ['Sold', 'sale'], purchase: ['Bought', 'paid'], to_receive: ['To receive', 'received'], to_pay: ['To pay', 'paid'], received: ['Received', 'received'], paid: ['Paid', 'paid'], credit: ['Udhaar', 'credit'] };
/** Several khata lines from one note: one compact card, one tap to add them all. */
function KhataGroup({ run, idx, onAct, onSkip, onAll }: { run: Run; idx: number[]; onAct: (i: number) => void; onSkip: (i: number) => void; onAll: () => void }) {
  const acts = run.result!.actions;
  const left = idx.filter(i => !run.done[i]);
  const ref = useEnter<HTMLDivElement>(true);
  return (
    <div className="kgroup" ref={ref}>
      <div className="scan-h"><span className="act-i ledger"><I n="book" /></span><div><b>Khata · {idx.length} entries</b><span>Not saved until you add them</span></div></div>
      {idx.map(i => { const a = acts[i]; const [lbl, cls] = KIND_UI[a.entry_kind || 'credit'] ?? ['Entry', 'credit']; const who = a.contact_name && !['Sales', 'Purchases'].includes(a.contact_name) ? a.contact_name : a.item || a.title;
        return (
          <div key={i} className={`krow ${run.done[i] ? 'done' : ''}`}>
            <span className={`kk ${cls}`}>{lbl}</span>
            <span className="who">{who}{a.contact_name === 'Name not given' && <small>Say the name and Artha fills it in</small>}{a.item && who !== a.item && <small>{a.item}</small>}</span>
            <b>{inr(a.amount_inr)}</b>
            {run.done[i] ? <span className="kd">{run.done[i] === 'Skipped' ? 'Skipped' : <I n="check" />}</span>
              : <span className="kb"><button className="icon-btn" onClick={() => onSkip(i)} aria-label="Skip"><I n="x" /></button><button className="icon-btn add" onClick={() => onAct(i)} aria-label="Add"><I n="check" /></button></span>}
          </div>); })}
      {left.length > 0 ? <button className="btn btn-primary" onClick={onAll} disabled={!!run.working}><I n="check" />Add {left.length === idx.length ? 'all' : left.length} to khata · {inr(left.reduce((s, i) => s + acts[i].amount_inr, 0))}</button>
        : <span className="ok"><I n="check" />Saved in your khata</span>}
    </div>
  );
}

const ISSUE_ICON = { error: 'alert', warn: 'alert', info: 'info' } as const;
/** A scanned page, the Kosha way: totals by section first, then what to check, then every line grouped. */
function ScanCard({ scan, run, onAll }: { scan: Scan; run: Run; onAll: () => void }) {
  const [focus, setFocus] = useState<number[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const ref = useEnter<HTMLDivElement>(true);
  const tiles = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!tiles.current) return;
    tiles.current.querySelectorAll<HTMLElement>('[data-n]').forEach(el => { const o = { v: 0 }; gsap.to(o, { v: Number(el.dataset.n), duration: 1.1, ease: 'power2.out', onUpdate: () => { el.textContent = inr(Math.round(o.v)); } }); });
  }, []);
  const acts = run.result?.actions ?? [];
  const added = acts.filter((_, i) => run.done[i]).length;
  const flagged = new Set(scan.issues.filter(i => i.level !== 'info').flatMap(i => i.lines));
  const errs = scan.issues.filter(i => i.level === 'error').length, warns = scan.issues.filter(i => i.level === 'warn').length;
  const line = (n: number) => scan.lines.find(l => l.n === n)!;
  return (
    <div className="scan" ref={ref}>
      <div className="scan-h">
        <span className="act-i ledger"><I n="book" /></span>
        <div><b>{scan.title}</b><span>{scan.date} · {scan.lines.length} lines read</span></div>
        <span className={`chip ${errs ? 'red' : warns ? 'amber' : 'green'}`}>{errs + warns ? `${errs + warns} to check` : 'All correct'}</span>
      </div>
      {scan.sections.length > 0 && <div className="tiles" ref={tiles}>{scan.sections.map(s => (
        <button key={s.kind} className={`tile ${s.kind} ${open === s.kind ? 'on' : ''}`} onClick={() => setOpen(o => (o === s.kind ? null : s.kind))}>
          <span className="tile-l">{s.label.split(' (')[0]}</span><b data-n={s.total}>{inr(0)}</b><small>{s.lines.length} {s.lines.length === 1 ? 'line' : 'lines'}</small>
        </button>))}</div>}
      {scan.issues.length > 0 && <div className="issues">{scan.issues.map((x, i) => (
        <button key={i} className={`issue ${x.level} ${focus.join() === x.lines.join() ? 'on' : ''}`} onClick={() => setFocus(f => (f.join() === x.lines.join() ? [] : x.lines))}>
          <I n={ISSUE_ICON[x.level]} /><span><b>{x.title}</b><small>{x.detail}</small></span>
          <span className="ln">{x.lines.map(n => <em key={n}>L{n}</em>)}</span>
        </button>))}</div>}
      <div className="lines">{scan.sections.filter(s => !open || s.kind === open).map(s => (
        <div key={s.kind} className="sec"><div className="sec-h"><span>{s.label}</span><b>{inr(s.total)}</b></div>
          {s.lines.map(n => { const l = line(n); return (
            <div key={n} className={`ln-r ${flagged.has(n) ? 'flag' : ''} ${focus.includes(n) ? 'focus' : ''}`}>
              <em>L{n}</em><span className="who">{l.party || l.item || '—'}{l.party && l.item && <small>{l.item}{l.qty ? ` · ${l.qty}` : ''}</small>}</span>
              <b>{inr(l.amount)}</b>
            </div>); })}
        </div>))}</div>
      {acts.length > 0 && <div className="scan-f">
        {added < acts.length
          ? <button className="btn btn-primary" onClick={onAll} disabled={!!run.working}><I n="check" />Add {acts.length - added} {acts.length - added === 1 ? 'entry' : 'entries'} to khata</button>
          : <span className="ok"><I n="check" />All {acts.length} entries in your khata</span>}
        <span className="dim small">Lines already in your khata are skipped</span>
      </div>}
    </div>
  );
}

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

/** The first screen: your own Artha (from Gmail) or a sample person. Skipped for demo links (?p=, ?say=). */
function shouldWelcome() {
  const q = new URLSearchParams(location.search);
  if (q.has('p') || q.has('say')) return false;
  try { return sessionStorage.getItem('artha.welcomed') !== '1'; } catch { return true; }
}
/** Google's official "G" mark (four colours), for the sign-in button. */
const GoogleG = () => (
  <svg className="g-mark" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
function Welcome({ me, samples, onPick }: { me: PersonaInfo | null; samples: PersonaInfo[]; onPick: (id: string) => void }) {
  const ref = useEnter<HTMLDivElement>(true);
  return (
    <div className="welcome" role="dialog" aria-label="Start with Artha">
      <div className="welcome-in" ref={ref}>
        <section className="w-sign">
          <div className="w-top"><span className="w-mark">A</span><div><b>Artha</b><small>Bas ishaara kaafi hai.</small></div></div>
          {me && (<>
            <button className="w-me" onClick={() => onPick(me.id)}><span className="av lg ink">{me.avatar}</span><span><b>Continue as {me.name.split(' ')[0]}</b><small>{me.email}</small></span><I n="send" /></button>
            <div className="w-or"><span>or use another account</span></div>
          </>)}
          <div className="w-lead"><h1>{me ? 'Sign in' : 'Set up your Artha'}</h1><p>Connect Gmail once. Artha learns your people, plans and dues, so a short voice note is enough.</p></div>
          <a className="g-btn" href={`${API_BASE}/api/auth/google`}><GoogleG /><span>Continue with Google</span></a>
          <ul className="w-trust">
            <li><I n="shield" /><span><b>Read-only.</b> Never sends, deletes or changes mail.</span></li>
            <li><I n="eye" /><span><b>Only what helps.</b> Promotions and OTPs are never read.</span></li>
            <li><I n="brain" /><span><b>Facts, not emails.</b> Keeps notes like “rent due 5 Dec”.</span></li>
            <li><I n="trash" /><span><b>Yours to remove.</b> Disconnect or delete any time.</span></li>
          </ul>
          <p className="w-fine">In testing, Google shows “unverified app”. Choose <b>Advanced → Go to Artha</b>.</p>
        </section>
        <section className="w-samples">
          <div className="w-samples-h"><b>Or explore a sample person</b><span>No sign-in needed</span></div>
          <div className="w-people">{samples.map(p => (
            <button key={p.id} onClick={() => onPick(p.id)}><span className="av ink">{p.avatar}</span><span><b>{p.name.split(' ')[0]}</b><small>{p.city} · {p.speaks[0]}</small></span></button>))}</div>
        </section>
      </div>
    </div>
  );
}
/** Right after signing in with Google: read the mail, learn who you are and who's who, file plans and bills. */
function SetupScreen({ pid, onDone }: { pid: string; onDone: (s: State | null) => void }) {
  const STEPS = ['Reading your mail', 'Learning who you are', 'Learning who\'s who', 'Filing plans, bills and facts'];
  const [step, setStep] = useState(0); const [line, setLine] = useState(''); const [who, setWho] = useState<{ name: string; city: string; about: string; contacts: number } | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null); const [err, setErr] = useState('');
  const final = useRef<State | null>(null);
  useEffect(() => {
    api.gmailSync(pid, e => {
      if (e.t === 'progress') {
        if (e.stage === 'list') setLine(`${e.n} mails from the last 90 days`);
        if (e.stage === 'triage') setLine(`${e.kept} worth reading · ${e.skipped} newsletters and promotions skipped`);
        if (e.stage === 'read') { setStep(1); setLine(`${e.n} mails read${e.otp ? ` · ${e.otp} OTP mail${e.otp > 1 ? 's' : ''} ignored` : ''}`); }
        if (e.stage === 'profile') setStep(1);
        if (e.stage === 'understood') setStep(3);
      } else if (e.t === 'profile') { setWho(e); setStep(2); }
      else if (e.t === 'done') setStats(e.stats);
      else if (e.t === 'state') final.current = e.state;
      else if (e.t === 'error') setErr(e.error);
    }).catch(e => setErr(e.message));
  }, [pid]);
  const done = !!stats;
  return (
    <div className="welcome setup" role="dialog" aria-label="Setting up Artha">
      <div className="welcome-in">
        <header className="w-head"><span className="w-mark">A</span><div><h1>{who ? `Namaste, ${who.name.split(' ')[0]}` : 'Setting up your Artha'}</h1><p>{who?.about || 'This takes about a minute.'}</p></div></header>
        <ol className="s-steps">{STEPS.map((t, i) => <li key={t} className={done || i < step ? 'ok' : i === step ? 'now' : ''}><span>{done || i < step ? <I n="check" /> : i + 1}</span>{t}</li>)}</ol>
        {line && !done && <p className="s-line"><span className="g-spin" />{line}</p>}
        {done && <div className="s-stats">{[['contacts', who?.contacts ?? 0, 'people in your life'], ['plans', stats!.plans, 'plans'], ['money', stats!.money, 'bills & payments'], ['facts', stats!.facts, 'things remembered']].map(([k, v, l]) => <div key={String(k)}><b>{v as number}</b><span>{l}</span></div>)}</div>}
        {err && <p className="bad">{err}</p>}
        {(done || err) && <button className="btn btn-primary" onClick={() => onDone(final.current)}>{done ? 'Start talking' : 'Continue'}</button>}
      </div>
    </div>
  );
}

/** Settings: your profile, Gmail, what Artha knows, voice, and your data (forget, delete, sign out). */
function Settings({ persona, state, voiceOn, onVoice, onClose, onState, onPersona, onKnows, onSignOut }: {
  persona: PersonaInfo; state: State | null; voiceOn: boolean; onVoice: () => void; onClose: () => void; onState: (s: State) => void;
  onPersona: (p: PersonaInfo) => void; onKnows: () => void; onSignOut: () => void;
}) {
  const own = persona.source === 'gmail';
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: persona.name, city: persona.city, about: persona.about, speaks: persona.speaks.join(', ') });
  const [g, setG] = useState<Awaited<ReturnType<typeof api.gmailStatus>> | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [confirm, setConfirm] = useState<'' | 'disconnect' | 'forget' | 'delete'>('');
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const refresh = useCallback(() => { api.gmailStatus(persona.id).then(setG).catch(() => setG(null)); api.context(persona.id).then(c => setCounts(c.counts)).catch(() => {}); }, [persona.id]);
  useEffect(refresh, [refresh]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const fromMail = state ? { facts: state.memory.filter(m => m.src.startsWith('Gmail')).length, plans: state.calendar.filter(c => c.source === 'gmail').length, money: (state.book ?? []).filter(b => b.id.startsWith('gmail:')).length } : null;
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setMsg(''); try { await fn(); } catch (e: any) { setMsg(e.message); } setBusy(''); setConfirm(''); refresh(); };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={e => e.stopPropagation()}>
        <div className="sheet-head"><h2>Settings</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><I n="x" /></button></div>

        <section className="set">
          <h3>Profile</h3>
          {!edit ? (
            <div className="prof"><span className="av lg ink">{persona.avatar}</span>
              <div><b>{persona.name}</b><small>{[persona.email, persona.city].filter(Boolean).join(' · ') || 'Sample person'}</small>
                <div className="chips">{persona.speaks.map(l => <span key={l} className="chip">{l}</span>)}</div>
                {persona.about && <p>{persona.about}</p>}</div>
              {own ? <button className="btn btn-ghost" onClick={() => setEdit(true)}>Edit</button> : <span className="chip">Sample</span>}
            </div>
          ) : (
            <form className="prof-form" onSubmit={e => { e.preventDefault(); run('Saving', async () => { const r = await api.saveProfile(persona.id, { ...form, speaks: form.speaks.split(',').map(x => x.trim()).filter(Boolean) }); onPersona(r.persona); setEdit(false); setMsg('Profile saved'); }); }}>
              <label>Name<input id="set-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label>City<input id="set-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
              <label>Languages you use<input id="set-langs" value={form.speaks} onChange={e => setForm({ ...form, speaks: e.target.value })} placeholder="Marathi, Hindi, English" /></label>
              <label>About you<textarea id="set-about" rows={2} value={form.about} onChange={e => setForm({ ...form, about: e.target.value })} /></label>
              <div className="row"><button className="btn btn-primary" disabled={!!busy}>Save</button><button type="button" className="link" onClick={() => setEdit(false)}>Cancel</button></div>
            </form>
          )}
        </section>

        <section className="set">
          <h3>Gmail</h3>
          {!own ? <p className="muted">Gmail is available when you set up Artha for yourself, from the start screen.</p>
            : !g?.connected ? (<>
              <p className="muted">Not connected. Connect to let Artha learn your people, plans and bills from mail. Read-only.</p>
              <a className="btn btn-primary set-btn" href={`${API_BASE}/api/gmail/connect?p=${encodeURIComponent(persona.id)}`}>Connect Gmail</a>
            </>) : (<>
              <div className="kv2"><span>Account</span><b>{g.email}</b><span>Last read</span><b>{g.lastSync ? new Date(g.lastSync).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Not yet'}</b>
                {g.stats && <><span>From mail</span><b>{[g.stats.facts && `${g.stats.facts} facts`, g.stats.plans && `${g.stats.plans} plans`, g.stats.money && `${g.stats.money} bills & payments`].filter(Boolean).join(' · ') || 'Nothing new'}</b>
                <span>Skipped</span><b>{g.stats.skipped ?? 0} promotions{g.stats.otp ? ` · ${g.stats.otp} OTP mails` : ''}</b></>}</div>
              <div className="row">
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => run('Reading new mail', async () => { await api.gmailSync(persona.id, e => { if (e.t === 'state') onState(e.state); }); setMsg('Up to date'); })}><I n="refresh" />{busy === 'Reading new mail' ? 'Reading…' : 'Sync now'}</button>
                <button className="link bad" onClick={() => setConfirm('disconnect')}>Disconnect</button>
              </div>
              {confirm === 'disconnect' && <div className="confirm"><p>Disconnect Gmail? Artha stops reading your mail and forgets what came from it{fromMail ? `: ${fromMail.facts} facts, ${fromMail.plans} plans, ${fromMail.money} bills & payments` : ''}. Your people and voice notes stay.</p>
                <div className="row"><button className="btn btn-primary danger" disabled={!!busy} onClick={() => run('Disconnecting', async () => { const r = await api.gmailDisconnect(persona.id); onState(r.state); setMsg('Gmail disconnected'); })}>Disconnect</button><button className="link" onClick={() => setConfirm('')}>Cancel</button></div></div>}
            </>)}
        </section>

        <section className="set">
          <h3>What Artha knows</h3>
          <div className="counts">{[['people', 'people'], ['facts', 'facts'], ['turns', 'conversations'], ['calendar', 'plans'], ['khata_entries', 'khata entries'], ['vectors', 'memories searchable by meaning']].map(([k, l]) => <div key={k}><b>{counts?.[k] ?? '–'}</b><span>{l}</span></div>)}</div>
          <button className="link" onClick={onKnows}>See everything Artha knows</button>
        </section>

        <section className="set">
          <h3>Voice</h3>
          <label className="toggle"><input type="checkbox" checked={voiceOn} onChange={onVoice} id="set-voice" /><span>Artha speaks its replies</span></label>
        </section>

        <section className="set">
          <h3>Your data</h3>
          <p className="muted">Kept for 90 days in your own private space, then forgotten unless it keeps being useful. Nothing is shared or sold.</p>
          <div className="row flexwrap">
            <button className="btn btn-ghost" onClick={() => setConfirm('forget')}><I n="refresh" />Forget what Artha learned</button>
            {own && <button className="btn btn-ghost danger-txt" onClick={() => setConfirm('delete')}><I n="trash" />Delete my Artha</button>}
            {own && <button className="link" onClick={onSignOut}>Sign out on this device</button>}
          </div>
          {confirm === 'forget' && <div className="confirm"><p>Forget all memories, conversations, plans and khata entries? {own ? 'Your profile and Gmail stay connected; the next sync re-reads your mail.' : 'This sample person goes back to the start.'}</p>
            <div className="row"><button className="btn btn-primary danger" disabled={!!busy} onClick={() => run('Forgetting', async () => { const r = await api.forget(persona.id); onState(r.state); setMsg('Done. Artha starts fresh.'); })}>Forget</button><button className="link" onClick={() => setConfirm('')}>Cancel</button></div></div>}
          {confirm === 'delete' && <div className="confirm"><p>Delete your Artha? Your profile, everything it learned and the Gmail connection are removed. This cannot be undone.</p>
            <div className="row"><button className="btn btn-primary danger" disabled={!!busy} onClick={() => run('Deleting', async () => { await api.deleteMe(persona.id); onSignOut(); })}>Delete everything</button><button className="link" onClick={() => setConfirm('')}>Cancel</button></div></div>}
        </section>
        {(busy || msg) && <p className="set-msg">{busy ? `${busy}…` : msg}</p>}
      </div>
    </div>
  );
}

/* ================= APP ================= */
export default function App() {
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [pid, setPid] = useState<string>(() => { const q = new URLSearchParams(location.search).get('p'); if (q) return q; try { return localStorage.getItem('artha.p') || 'aditya'; } catch { return 'aditya'; } });
  // the user's own Artha (created by signing in with Google), remembered on this device
  const [me, setMe] = useState<PersonaInfo | null>(null);
  const [welcome, setWelcome] = useState(shouldWelcome);
  const [settings, setSettings] = useState(false);
  const [setup, setSetup] = useState(() => { const q = new URLSearchParams(location.search); return q.get('new') === '1' && (q.get('p') ?? '').startsWith('u-'); });
  const [pstate, setPstate] = useState<State | null>(null);
  const [intro, setIntro] = useState(shouldShowIntro);
  const endIntro = useCallback(() => setIntro(false), []);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [tab, setTab] = useState<Tab>('artha');
  const [runs, setRuns] = useState<Record<string, Run[]>>({});
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [rec, setRec] = useState<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => { try { return localStorage.getItem('artha.voice') !== 'off'; } catch { return true; } });
  const voice = useRef<HTMLAudioElement | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  const allPeople = me ? [...personas.filter(p => p.id !== me.id), me] : personas;
  const persona = allPeople.find(p => p.id === pid);
  const myRuns = runs[pid] ?? [];
  const busy = myRuns.some(r => !r.result && !r.error);
  const orbMode: OrbMode = rec ? 'listening' : busy ? 'thinking' : speaking ? 'speaking' : myRuns.at(-1)?.result ? 'done' : 'idle';
  const say = useCallback((t: string) => { setToast(t); window.clearTimeout((say as any)._t); (say as any)._t = window.setTimeout(() => setToast(''), 2400); }, []);

  useEffect(() => { api.personas().then(setPersonas).catch(e => say(e.message)); api.samples().then(setSamples); }, [say]);
  const loadMe = useCallback((id?: string) => {
    let mine = id; try { mine = mine ?? localStorage.getItem('artha.me') ?? undefined; } catch { /* */ }
    if (!mine) return;
    api.persona(mine).then(p => { setMe(p); try { localStorage.setItem('artha.me', p.id); } catch { /* */ } }).catch(() => {});
  }, []);
  useEffect(() => { loadMe(pid.startsWith('u-') ? pid : undefined); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('artha.p', pid); } catch { /* private mode */ } setPstate(null); setOpenChat(null); api.state(pid).then(setPstate).catch(e => say(e.message)); }, [pid, say]);
  // ?p=imran&say=... runs a typed note on load (handy for demos and screenshots)
  const autoRan = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('p') && q.get('p') !== pid && allPeople.some(x => x.id === q.get('p'))) { setPid(q.get('p')!); return; }
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

  /* ---------- Artha talks back ---------- */
  function playUrl(url: string, onStart?: () => void) {
    voice.current?.pause();
    const a = new Audio(url);
    if (onStart) a.addEventListener('playing', onStart, { once: true });
    a.playbackRate = 1.12; (a as any).preservesPitch = true;
    a.onplay = () => setSpeaking(true);
    a.onended = a.onpause = a.onerror = () => setSpeaking(false);
    voice.current = a;
    a.play().catch(() => setSpeaking(false));
  }
  /** Speak a line now (streamed audio); onStart fires when the first sound plays. */
  function speakText(runId: number, text: string, onStart?: () => void) {
    if (!text || !voiceOn) return;
    const url = `${API_BASE}/api/speak?p=${encodeURIComponent(pid)}&text=${encodeURIComponent(text.slice(0, 400))}`;
    update(runId, { replyUrl: url });
    playUrl(url, onStart);
  }
  async function speakReply(runId: number, r: Result, force = false) {
    const text = r.reply_speech || r.reply;
    if (!text || (!voiceOn && !force)) return;
    // Streamed: the audio element starts playing as the first bytes arrive, while the rest is still being generated.
    const url = `${API_BASE}/api/speak?p=${encodeURIComponent(pid)}&text=${encodeURIComponent(text.slice(0, 400))}`;
    update(runId, { replyUrl: url });
    playUrl(url);
  }
  const toggleVoice = () => setVoiceOn(v => { const n = !v; try { localStorage.setItem('artha.voice', n ? 'on' : 'off'); } catch { /* */ } if (!n) voice.current?.pause(); return n; });

  /* ---------- the pipeline ---------- */
  async function process(run: Run) {
    setRuns(all => ({ ...all, [pid]: [...(all[pid] ?? []), run] }));
    setTab('artha'); scrollDown();
    // One streamed request. Each piece shows the moment it arrives; Artha starts speaking before the cards are done.
    const t0 = performance.now();
    const mark = (k: keyof NonNullable<Run['times']>) => update(run.id, r => (r.times?.[k] ? {} : { times: { ...r.times, [k]: Math.round(performance.now() - t0) } }));
    let failed = '', spoke = false;
    // the voice arrives inside the same stream when this browser can play streamed MP3 (MediaSource); else it is fetched
    const MS: any = (window as any).ManagedMediaSource ?? (window as any).MediaSource;
    const inline = voiceOn && !!MS?.isTypeSupported?.('audio/mpeg');
    let player: { push: (b64: string) => void; end: () => void } | null = null;
    const startPlayer = () => {
      const ms = new MS(); const a = new Audio(); (a as any).disableRemotePlayback = true;
      a.src = URL.createObjectURL(ms); a.playbackRate = 1.12; (a as any).preservesPitch = true;
      const pending: Uint8Array[] = []; let sb: any = null, ended = false;
      const pump = () => { if (!sb || sb.updating) return; if (pending.length) sb.appendBuffer(pending.shift()); else if (ended && ms.readyState === 'open') ms.endOfStream(); };
      ms.addEventListener('sourceopen', () => { sb = ms.addSourceBuffer('audio/mpeg'); sb.addEventListener('updateend', pump); pump(); }, { once: true });
      a.addEventListener('playing', () => { mark('voice'); setSpeaking(true); }, { once: true });
      a.onended = a.onpause = () => setSpeaking(false);
      voice.current?.pause(); voice.current = a; a.play().catch(() => {});
      return { push: (b64: string) => { pending.push(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); pump(); }, end: () => { ended = true; pump(); } };
    };
    if (!run.audio) update(run.id, { stage: 1 });
    try {
      await api.note(pid, run.audio ? { audio: run.audio, voice: inline } : { transcript: run.transcript, voice: inline }, e => {
        if (e.t === 'heard') { update(run.id, { transcript: e.text, stage: 1 }); mark('heard'); }
        else if (e.t === 'gist') { update(run.id, { gist: e.heard, stage: 2 }); mark('gist'); if (!run.audio) mark('heard'); }
        else if (e.t === 'say') {
          spoke = true; update(run.id, r => (r.stage < 3 ? { stage: 3 } : {}));
          if (inline) update(run.id, { replyUrl: `${API_BASE}/api/speak?p=${encodeURIComponent(pid)}&text=${encodeURIComponent(String(e.text).slice(0, 400))}` });
          else speakText(run.id, e.text, () => mark('voice'));
        }
        else if (e.t === 'audio_start') player = startPlayer();
        else if (e.t === 'audio') player?.push(e.b64);
        else if (e.t === 'audio_end') player?.end();
        else if (e.t === 'result') {
          update(run.id, { result: e.result, transcript: e.transcript ?? run.transcript, stage: 4, endedAt: Date.now() }); mark('cards'); scrollDown();
          if (e.result.clarify) voice.current?.pause();                 // asking which one: don't talk over the question
          else if (!spoke) speakText(run.id, e.result.reply_speech || e.result.reply, () => mark('voice'));
        }
        else if (e.t === 'state') applyState(e.state);
        else if (e.t === 'error') failed = e.error;
      });
      if (failed) throw new Error(failed);
    } catch (e: any) { update(run.id, { error: e.message, stage: 4, endedAt: Date.now() }); }
  }
  const fromAudio = (audio: Blob, source: Run['source'], label?: string, synthetic?: boolean) =>
    process({ id: ++seq, source, label, audio, audioUrl: URL.createObjectURL(audio), synthetic, stage: 0, done: {}, startedAt: Date.now() });
  const fromText = (text: string) => process({ id: ++seq, source: 'typed', transcript: text, stage: 0, done: {}, startedAt: Date.now() });
  /** A photo: shrink it on the phone (fast upload), then read, check and file it. */
  async function fromPhoto(file: File) {
    if (!file.type.startsWith('image/')) { say('That is not a photo.'); return; }
    const image = await shrink(file, 1600, 0.82);
    const run: Run = { id: ++seq, source: 'photo', image, stage: 0, done: {}, startedAt: Date.now() };
    setRuns(all => ({ ...all, [pid]: [...(all[pid] ?? []), run] }));
    setTab('artha'); scrollDown();
    const timers = [1, 2, 3].map(s => setTimeout(() => update(run.id, r => (r.stage < s ? { stage: s } : {})), s * 1800));
    try {
      const out = await api.scan(pid, image);
      update(run.id, { result: out.result, scan: out.scan, stage: 4, endedAt: Date.now() });
      applyState(out.state); scrollDown(); speakReply(run.id, out.result);
    } catch (e: any) { update(run.id, { error: e.message, stage: 4, endedAt: Date.now() }); }
    finally { timers.forEach(clearTimeout); }
  }
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
  const skip = (run: Run, i: number) => { api.skip(pid, run.result?.actions[i]?.id, run.result?.actions[i]?.updates).catch(() => {}); update(run.id, x => ({ done: { ...x.done, [i]: 'Skipped' }, confirm: null })); };
  async function doAll(run: Run) { for (const [i, a] of run.result!.actions.entries()) if (['message', 'calendar', 'reminder', 'ledger'].includes(a.type) && !run.done[i]) await act(run, i); }
  /** One tap to pick someone else: Artha re-plans and quietly remembers. No question asked. */
  async function choose(run: Run, mention: string, contactId: string, how: 'asked' | 'changed') {
    update(run.id, { working: true });
    try {
      const a = await api.answer(pid, mention, contactId, run.result?.topics?.[0], how); applyState(a.state);
      const out = await api.understand(pid, run.transcript ?? run.result!.transcript, 'artha', { [mention]: contactId });
      update(run.id, { result: out.result, working: false, done: {} }); applyState(out.state); speakReply(run.id, out.result);
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
    if (rec || starting.current || busy) return; starting.current = true; voice.current?.pause();
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
      {intro && <Intro onDone={endIntro} />}
      <header className="top">
        <div className="brand"><img className="logo" src="/icon.svg" alt="" /><b>Artha</b></div>
        <nav className="topnav" aria-label="Views">
          {([['artha', 'Artha'], ['chats', 'Chats'], ['results', 'Results'], ['about', 'About']] as const).map(([t, l]) => (
            <button key={t} className={t === 'chats' ? 'only-mid' : ''} aria-current={tab === t || (t === 'artha' && tab === 'memory') ? 'page' : undefined} onClick={() => go(t)}>{l}</button>))}
        </nav>
        <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Settings"><I n="gear" /></button>
        <button className="icon-btn voice-tg" onClick={toggleVoice} aria-label={voiceOn ? 'Mute Artha’s voice' : 'Let Artha speak'} aria-pressed={voiceOn}><I n={voiceOn ? 'speak' : 'mute'} /></button>
        {persona && <button className="who-btn" onClick={() => setMenu(true)} aria-label={`Testing as ${persona.name}. Switch person`}><span className="av ink">{persona.avatar}</span><span className="nm">{first(persona.name)}</span><I n="swap" s={{ width: 14, height: 14, opacity: .6 }} /></button>}
      </header>

      <main className="main" data-tab={tab}>
        {wide ? <div className="page">{tab === 'results' ? <Results /> : <About personas={personas} onTry={() => go('artha')} />}</div> : (<>
          <section className="pane pane-chats" aria-label="Chats">
            <Chats persona={persona} state={pstate} open={openChat} setOpen={setOpenChat} onSwitch={() => setMenu(true)} />
          </section>

          <section className={`pane pane-thread ${empty ? 'is-empty' : ''}`} aria-label="Artha" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !busy) fromPhoto(f); }}>
            <div className="feed" ref={feed}>
              {empty && (
                <div className="hero-copy">
                  <h1>Bas ishaara<br />kaafi hai.</h1>
                  <p>{rec ? 'Listening… release to send' : 'Hold the orb and speak'}</p>
                  {mySamples.length > 0 && !rec && (
                    <div className="pills">{mySamples.map(s => <button key={s.id} className="pill" onClick={() => playSample(s)}><I n="play" s={{ width: 11, height: 11, fill: 'currentColor', stroke: 'none' }} />{s.label}</button>)}</div>)}
                </div>)}
              {myRuns.map(r => <Note key={r.id} run={r} persona={persona} onAct={act} onSkip={skip} onAll={doAll} onChoose={choose} onCompare={compare} onReplay={() => (r.replyUrl ? playUrl(r.replyUrl) : r.result && speakReply(r.id, r.result, true))} />)}
              {!empty && mySamples.length > 0 && !busy && (
                <div className="pills tail">{mySamples.map(s => <button key={s.id} className="pill" onClick={() => playSample(s)}><I n="play" s={{ width: 11, height: 11, fill: 'currentColor', stroke: 'none' }} />{s.label}</button>)}</div>)}
            </div>
            <div className={`orb-wrap ${empty ? 'hero' : 'docked'} ${rec ? 'rec' : ''}`}>
              <button className="orb-btn" onPointerDown={orbDown} onPointerUp={orbUp} onPointerLeave={orbUp} onContextMenu={e => e.preventDefault()}
                aria-label={rec ? 'Stop and send' : 'Hold to speak'} disabled={busy && !rec}>
                <span className="halo" /><Orb mode={orbMode} level={level} />
              </button>
            </div>
            <TypeBar onText={fromText} onPhoto={fromPhoto} disabled={busy} />
          </section>

          <aside className="pane pane-side" aria-label="What Artha knows">
            <Knows persona={persona} state={pstate} fresh={fresh} onReset={reset} onState={applyState} />
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
            {me && <><h4>You</h4>
              <button aria-current={me.id === pid} onClick={() => { setPid(me.id); setMenu(false); setTab('artha'); }}>
                <span className="av lg ink">{me.avatar}</span><span><b>{me.name}</b><small>{me.email ?? 'Your Gmail'} · {me.speaks.join(', ')}</small></span>
              </button></>}
            <h4>Sample people</h4>
            {personas.map(p => (
              <button key={p.id} aria-current={p.id === pid} onClick={() => { setPid(p.id); setMenu(false); setTab('artha'); }}>
                <span className="av lg ink">{p.avatar}</span><span><b>{p.name}</b><small>{p.city} · {p.speaks.join(', ')}</small></span>
              </button>))}
            <button className="link reset" onClick={() => { setMenu(false); setSettings(true); }}><I n="gear" />Settings</button>
            <button className="link reset" onClick={() => { setMenu(false); setWelcome(true); }}><I n="back" />Back to start</button>
          </div>
        </div>)}
      {welcome && !setup && <Welcome me={me} samples={personas} onPick={id => { setPid(id); setWelcome(false); setTab('artha'); try { sessionStorage.setItem('artha.welcomed', '1'); } catch { /* */ } }} />}
      {setup && <SetupScreen pid={pid} onDone={(st) => { if (st) applyState(st); loadMe(pid); setSetup(false); setWelcome(false); history.replaceState(null, '', `${location.pathname}?p=${pid}`); try { sessionStorage.setItem('artha.welcomed', '1'); } catch { /* */ } }} />}
      {settings && persona && <Settings persona={persona} state={pstate} voiceOn={voiceOn} onVoice={toggleVoice} onClose={() => setSettings(false)}
        onState={applyState} onPersona={p => { setMe(p); }} onKnows={() => { setSettings(false); go('memory'); }}
        onSignOut={() => { try { localStorage.removeItem('artha.me'); sessionStorage.removeItem('artha.welcomed'); } catch { /* */ } setMe(null); setSettings(false); setPid('aditya'); setWelcome(true); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ================= one voice note ================= */
function Note({ run, persona, onAct, onSkip, onAll, onChoose, onCompare, onReplay }: {
  run: Run; persona?: PersonaInfo; onAct: (r: Run, i: number, confirmed?: boolean) => void; onSkip: (r: Run, i: number) => void;
  onAll: (r: Run) => void; onChoose: (r: Run, mention: string, id: string, how: 'asked' | 'changed') => void; onCompare: (r: Run) => void; onReplay: () => void;
}) {
  const res = run.result;
  const [how, setHow] = useState(false);
  const ref = useEnter<HTMLElement>(!!res);
  const heard = res?.transcript ?? run.transcript ?? '';
  const shown = res?.transcript ?? heard;
  const marks = res ? [
    ...res.mentions.filter(m => m.kind === 'person' && m.candidates.length).map(m => ({ text: m.text, cls: 'person', label: [...m.candidates].sort((a, b) => b.score - a.score)[0].name })),
    ...res.entities.map(e => ({ text: nonLatin(res.transcript) ? origOf(res.transcript, e.text) : e.text, cls: e.kind, label: e.label.replace(/^.*→ /, '') })),
  ] : [];
  const pointsRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => { if (pointsRef.current) gsap.from(pointsRef.current.children, { x: -6, opacity: 0, duration: .35, stagger: .05, ease: 'power2.out' }); }, [res?.reply_points?.length]);
  const ledgerIdx = res?.actions.flatMap((a, i) => (a.type === 'ledger' ? [i] : [])) ?? [];
  const safeLeft = res?.actions.filter((a, i) => ['message', 'calendar', 'reminder', 'ledger'].includes(a.type) && !run.done[i]).length ?? 0;
  const T = SHOW_TIMES ? run.times ?? {} : {};   // timings are for us (?debug=1), not for the person using Artha
  const timeline = ([['Heard', T.heard], ['You said', T.gist], ['Voice', T.voice], ['Cards', T.cards]] as const).filter(([, v]) => v != null) as [string, number][];
  const contact = (id: string) => persona?.contacts.find(x => x.id === id);

  return (
    <article className="note" ref={ref}>
      <Heard run={run} res={res} shown={heard ? shown : ''} marks={marks} />

      {!res && !run.error && <Progress stage={run.stage} labels={run.image ? ['Photo', 'Reading', 'Checking', 'Filing'] : undefined} />}
      {run.error && <p className="err">{run.error}</p>}

      {res && <>
        {res.blocked ? (
          <div className="card blocked"><I n="shield" /><div><b>Never shared. An OTP stays with you.</b><span>Hidden before any AI saw it.</span></div></div>
        ) : !res.heard && !run.scan ? (
          <p className="understood"><Highlight text={shown} marks={marks} /></p>
        ) : null}
        {run.scan && <ScanCard scan={run.scan} run={run} onAll={() => onAll(run)} />}

        {res.clarify && (
          <div className="clar"><b>{res.clarify.question}</b>
            <div className="opts">{res.clarify.options.map(o => <button key={o.id} className="btn btn-ghost" disabled={run.working} onClick={() => onChoose(run, res.clarify!.mention, o.id, 'asked')}>{o.label}<small>{contact(o.id)?.rel}</small></button>)}</div>
          </div>)}

        {res.actions.length > 0 && !run.scan && (
          <div className="acts">
            {ledgerIdx.length >= 2 && <KhataGroup run={run} idx={ledgerIdx} onAct={i => onAct(run, i)} onSkip={i => onSkip(run, i)} onAll={() => onAll(run)} />}
            {res.actions.map((a, i) => ledgerIdx.length >= 2 && a.type === 'ledger' ? null : <ActionCard key={`${i}-${a.contact_id}`} a={a} done={run.done[i]} busy={run.busy === i || !!run.working} confirming={run.confirm === i} contact={contact(a.contact_id)}
              onDo={() => onAct(run, i)} onConfirm={() => onAct(run, i, true)} onSkip={() => onSkip(run, i)} onChange={id => onChoose(run, a.mention ?? a.contact_name, id, 'changed')} />)}
            {safeLeft > 1 && !(ledgerIdx.length >= 2 && ledgerIdx.length === res.actions.length) && <button className="btn btn-primary doall" onClick={() => onAll(run)}><I n="check" />Do all</button>}
          </div>)}

        {(res.reply_speech || res.reply) && (res.reply_points?.length
          ? <div className="say answer"><button className="say-i" onClick={onReplay} aria-label="Hear Artha’s answer"><I n="speak" /></button>
              <div className="ans"><b>{res.reply}</b><ul ref={pointsRef}>{res.reply_points.map((x, i) => <li key={i}><span className="pl">{x.label}</span><span>{x.text}</span></li>)}</ul></div></div>
          : <button className="say" onClick={onReplay} aria-label="Hear Artha’s reply"><span className="say-i"><I n="speak" /></span><span>{res.reply_speech || res.reply}</span></button>)}
        <div className="foot">
          <span className="dim times" title="Time from letting go of the orb">{timeline.map(([k, v]) => <span key={k}>{k} <b>{v.toLocaleString('en-IN')} ms</b></span>)}</span>
          <button className={`foot-btn ${run.compare ? 'on' : ''}`} onClick={() => (run.compare ? null : onCompare(run))}><I n="vs" />Base model</button>
          <button className={`foot-btn ${how ? 'on' : ''}`} onClick={() => setHow(h => !h)}><I n="eye" />How</button>
        </div>
        {run.compare && <Compare cmp={run.compare} />}
        {how && <How run={run} res={res} />}
      </>}
    </article>
  );
}

function Progress({ stage, labels = ['Heard', 'Meaning', 'Who', 'Plan'] }: { stage: number; labels?: string[] }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bar.current) gsap.to(bar.current, { scaleX: Math.min(1, (stage + 0.6) / 4), duration: 0.9, ease: 'power2.out' }); }, [stage]);
  return (
    <div className="progress" aria-label="Working">
      <div className="track"><div className="fill" ref={bar} /></div>
      <div className="labels">{labels.map((l, i) => <span key={l} className={i < stage ? 'done' : i === stage ? 'now' : ''}>{l}</span>)}</div>
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
  const title = { message: who, call: `Call ${who}`, reminder: a.title || 'Reminder', calendar: a.title || 'Calendar', payment: `Pay ${who}`, ledger: a.entry_kind && a.entry_kind !== 'credit' ? `${({ sale: 'Sale', purchase: 'Purchase', to_receive: 'To receive', to_pay: 'To pay', received: 'Received', paid: 'Paid' } as Record<string, string>)[a.entry_kind]} · ${who}` : `${who}’s khata`, suggestion: a.title || 'Suggestion' }[a.type];
  const verb = { message: 'Send', call: 'Let Artha call', reminder: 'Remind me', calendar: 'Add', payment: `Pay ₹${a.amount_inr.toLocaleString('en-IN')}`, ledger: `${a.updates && a.updates !== a.id ? 'Update' : 'Add'} ₹${a.amount_inr.toLocaleString('en-IN')}`, suggestion: 'Yes' }[a.type];
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
      {(a.links?.filter(l => l.kind !== 'upi').length ?? 0) > 0 && (
        <div className="opens">{a.links!.filter(l => l.kind !== 'upi').map(l => (
          <a key={l.href} className={`open ${l.kind}`} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => { if (!done && a.type !== 'payment') onDo(); }}>
            <I n={{ whatsapp: 'chat', sms: 'chat', call: 'call', gcal: 'cal', maps: 'eye', upi: 'rupee' }[l.kind] ?? 'send'} s={{ width: 14, height: 14 }} />{l.label}
          </a>))}</div>)}
      {done ? <div className="ok"><I n="check" />{done}</div>
        : confirming ? <div className="act-btns"><span className="confirm">Pay ₹{a.amount_inr.toLocaleString('en-IN')} to {who}? Your UPI app opens; you enter the PIN there.</span>
            {a.links?.filter(l => l.kind === 'upi').map(l => <a key={l.href} className="btn btn-primary btn-sm" href={l.href} onClick={onConfirm}>{l.label}</a>)}
            <button className="btn btn-ghost btn-sm" onClick={onConfirm} disabled={busy}>Mark paid</button><button className="btn btn-ghost btn-sm" onClick={onSkip}>Cancel</button></div>
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

function TypeBar({ onText, onPhoto, disabled }: { onText: (t: string) => void; onPhoto: (f: File) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const file = useRef<HTMLInputElement>(null);
  return (
    <form className="typebar" onSubmit={e => { e.preventDefault(); if (text.trim() && !disabled) { onText(text.trim()); setText(''); } }}>
      <button type="button" className="cam" onClick={() => file.current?.click()} disabled={disabled} aria-label="Send a photo: khata page, bill, prescription"><I n="camera" /></button>
      <input ref={file} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Type, or send a photo of your khata" aria-label="Type a note" />
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
/** Gmail, read-only: connect, sync (with live progress), see what was learned, disconnect (forgets everything from mail). */
function GmailCard({ pid, onState }: { pid: string; onState: (s: State) => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof api.gmailStatus>> | null>(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(() => api.gmailStatus(pid).then(x => { setSt(x); return x; }).catch(() => { setSt(null); return null; }), [pid]);
  // your own Gmail: new mail is read quietly when you come back (last sync over 30 minutes ago)
  useEffect(() => { if (!pid.startsWith('u-') || new URLSearchParams(location.search).has('new')) return;
    load().then(x => { if (x?.connected && (!x.lastSync || Date.now() - Date.parse(x.lastSync) > 30 * 60e3)) syncRef.current?.(); }); }, [pid]);   // eslint-disable-line react-hooks/exhaustive-deps
  const syncRef = useRef<() => void>();
  const sync = useCallback(async () => {
    setErr(''); setBusy('Opening your mail…');
    try {
      await api.gmailSync(pid, e => {
        if (e.t === 'progress') setBusy(({ list: `Found ${e.n} new mails…`, triage: `${e.skipped} newsletters and promotions skipped · reading ${e.kept}…`, read: `Understanding ${e.n} mails${e.otp ? ` (${e.otp} OTP mail${e.otp > 1 ? 's' : ''} ignored)` : ''}…`, understood: `Filing what matters…` } as Record<string, string>)[e.stage] ?? 'Working…');
        else if (e.t === 'state') onState(e.state);
        else if (e.t === 'error') setErr(e.error);
      });
    } catch (e: any) { setErr(e.message); }
    setBusy(''); load();
  }, [pid, onState, load]);
  syncRef.current = sync;
  useEffect(() => {
    load();
    const q = new URLSearchParams(location.search);
    if (q.get('gmail') === 'connected' && q.get('new') !== '1') { history.replaceState(null, '', `${location.pathname}?p=${pid}`); sync(); }
    else if (q.get('gmail') === 'failed') { setErr('Gmail was not connected. Try again.'); history.replaceState(null, '', `${location.pathname}?p=${pid}`); }
  }, [pid]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!st?.configured) return null;
  const s = st.stats;
  return (
    <div className="mini gmail"><h4>Gmail</h4>
      {!st.connected ? (<>
        <p className="g-note">Read-only. Artha learns who's who, plans, bills and payments from the last 90 days. Promotions and OTP mails are never read.</p>
        <a className="btn btn-primary g-btn" href={`${API_BASE}/api/gmail/connect?p=${encodeURIComponent(pid)}`}><I n="chat" />Connect Gmail</a>
      </>) : (<>
        <p className="g-note"><b>{st.email}</b>{st.lastSync ? ` · synced ${fmtTime(st.lastSync)}` : ''}</p>
        {busy ? <p className="g-busy"><span className="g-spin" />{busy}</p> : s ? (
          <div className="g-stats">{[['people', 'new people'], ['plans', 'plans'], ['money', 'bills & payments'], ['facts', 'facts'], ['scams', 'scam flagged']].filter(([k]) => s[k]).map(([k, l]) => <span key={k}><b>{s[k]}</b> {l}</span>)}
            <span className="dim">{s.scanned} mails scanned · {s.skipped} skipped{s.otp ? ` · ${s.otp} OTP ignored` : ''}</span></div>) : null}
        <div className="g-row"><button className="btn btn-ghost" onClick={sync} disabled={!!busy}><I n="refresh" />{s ? 'Sync again' : 'Sync now'}</button>
          <button className="link" onClick={async () => { setBusy(''); const r = await api.gmailDisconnect(pid); onState(r.state); load(); }} disabled={!!busy}>Disconnect</button></div>
      </>)}
      {err && <p className="bad small">{err}</p>}
    </div>
  );
}

function Knows({ persona, state, fresh, onReset, onState }: { persona?: PersonaInfo; state: State | null; fresh: Set<string>; onReset: () => void; onState: (s: State) => void }) {
  const [all, setAll] = useState(false);
  const listRef = useEnter<HTMLDivElement>(state?.memory.length);
  if (!state || !persona) return null;
  const facts = [...state.memory].sort((a, b) => Number(!!b.learned) - Number(!!a.learned));
  const shown = all ? facts : facts.slice(0, 6);
  const upcoming = [...state.calendar.filter(c => Date.parse(c.when_iso) > Date.now() - 36e5), ...state.reminders.map(r => ({ title: r.title, when_label: r.when_label, when_iso: r.when_iso, added: true }))]
    .sort((a, b) => Date.parse(a.when_iso) - Date.parse(b.when_iso)).slice(0, 4);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const book = (state.book ?? []).filter(e => e.status !== 'dropped').slice(-6).reverse();
  const owed = Object.entries(state.ledger.reduce<Record<string, number>>((m, l) => ({ ...m, [l.contact]: (m[l.contact] ?? 0) + l.amount }), {}));
  return (<>
    <div className="knows-h"><h3>Artha knows</h3><span className="big">{state.memory.length}</span></div>
    <div className="facts" ref={listRef}>{shown.map(m => (
      <div key={m.fact} className={`fact ${m.learned ? 'learned' : ''} ${fresh.has(m.fact) ? 'fresh' : ''}`}><I n={m.kind === 'alias' ? 'swap' : m.learned ? 'spark' : 'brain'} /><span>{m.fact}</span></div>))}
      {facts.length > 6 && <button className="link" onClick={() => setAll(x => !x)}>{all ? 'Show less' : `+${facts.length - 6} more`}</button>}
    </div>
    <GmailCard pid={persona.id} onState={onState} />
    <div className="mini"><h4>Connected on this phone</h4><div className="conns">{[['chat', 'WhatsApp'], ['call', 'Phone'], ['cal', 'Google Calendar'], ['rupee', 'UPI apps'], ['brain', 'Contacts · sample'], ['call', 'Equal calls · simulated']].map(([ic, l]) => <span key={l} className="conn"><I n={ic} s={{ width: 13, height: 13 }} />{l}</span>)}</div></div>
    {upcoming.length > 0 && <div className="mini"><h4>Coming up</h4>{upcoming.map((c, i) => <div key={i} className={c.added ? 'added' : ''}><span>{c.title}</span><span>{c.when_label}</span></div>)}</div>}
    {book.length > 0 && <div className="mini"><h4>Khata book</h4>{book.map(e => <div key={e.id} className={e.status === 'saved' ? 'added' : ''}><span>{({ sale: 'Sold', purchase: 'Bought', to_receive: 'To receive', to_pay: 'To pay', received: 'Received', paid: 'Paid', credit: 'Credit' } as Record<string, string>)[e.kind]}{e.party ? ` · ${e.party}` : e.item ? ` · ${e.item}` : ''}{e.day !== today ? ` · ${e.day.slice(5)}` : ''}</span><span>₹{e.amount.toLocaleString('en-IN')}</span></div>)}</div>}
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
