// Image input: a photo of a khata page, a bill, a prescription, anything. The model READS it (every line as
// written, typed into a fixed schema); code does the arithmetic and the checks (line maths, totals, duplicates,
// already in the khata, unclear figures, new people), groups lines into sections and proposes khata entries.
import { jsonCall } from '../openai.js';
import type { Action, BookEntry, EntryKind, Persona, Result, State } from '../types.js';
import { checkActions } from './rules.js';
import { soundKey } from './candidates.js';
import { romanize } from './translit.js';

export type ScanLine = { n: number; text: string; party: string; contact_id: string; item: string; qty: string; rate: number; amount: number; kind: string; confidence: number };
export type Issue = { level: 'error' | 'warn' | 'info'; title: string; detail: string; lines: number[] };
export type Section = { kind: string; label: string; total: number; lines: number[] };
export type Scan = {
  doc_type: string; title: string; date: string; lines: ScanLine[]; written_totals: { label: string; amount: number; covers: string }[];
  sections: Section[]; issues: Issue[]; summary: string; image?: string;
};

const KINDS = ['sale', 'credit', 'received', 'purchase', 'paid', 'to_pay', 'to_receive', 'expense', 'other'];
export const SECTION_LABEL: Record<string, string> = { sale: 'Cash sales', credit: 'Given on credit (udhaar)', received: 'Money received', purchase: 'Stock bought', paid: 'Paid to suppliers', to_pay: 'To pay', to_receive: 'To receive', expense: 'Expenses', other: 'Other' };

const INSTRUCTIONS = `You read photos for Artha, an assistant for small Indian shopkeepers and households. Read the image carefully, line by line, exactly as written (Hindi, Marathi, Urdu, Gujarati, Tamil, Telugu or English; handwriting is common).
- doc_type: khata_page | bill | receipt | prescription | invitation | notice | other.
- lines: EVERY money line in order (n from 1). text: the line as written. party: the person or business named ("" if none), contact_id: their id from CONTACTS if clearly the same person, else "none". item, qty (as written, "5kg", "2 × 180"), rate (per unit if written, else 0), amount: the amount WRITTEN at the end of the line (never correct it; we check maths in code). kind: sale (cash sale), credit (a customer took goods on udhaar), received (money came in), purchase (stock bought), paid (money paid out to a supplier), to_pay, to_receive, expense (salary, rent, advance, bills), other. "X ko diye / ko diya / la dile / ku koduthen" to a supplier = paid; "X se aaye / mile / kadun aale" = received; a customer name with goods and no "nakad" = credit. confidence: 0 to 1, how sure you are you read the AMOUNT right (smudged or unclear = below 0.6).
- written_totals: totals written on the page (label as written, amount, covers: which kind(s) it totals, e.g. "sale").
- date: the date written on the page as YYYY-MM-DD, or "".
- title: 3 to 6 words. summary: one short line in the user's language (Roman script for Hindi/Marathi), what this page is.
- For a prescription or other document with no money lines, lines = [] and the summary says what matters (medicines and timings, event date and place).
Do not invent lines you cannot see.`;

const lineSchema = { type: 'object', additionalProperties: false, required: ['n', 'text', 'party', 'contact_id', 'item', 'qty', 'rate', 'amount', 'kind', 'confidence'], properties: {
  n: { type: 'number' }, text: { type: 'string' }, party: { type: 'string' }, contact_id: { type: 'string' }, item: { type: 'string' }, qty: { type: 'string' },
  rate: { type: 'number' }, amount: { type: 'number' }, kind: { type: 'string', enum: KINDS }, confidence: { type: 'number' } } };
const schema = { type: 'object', additionalProperties: false, required: ['doc_type', 'title', 'date', 'lines', 'written_totals', 'summary'], properties: {
  doc_type: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, lines: { type: 'array', items: lineSchema },
  written_totals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'amount', 'covers'], properties: { label: { type: 'string' }, amount: { type: 'number' }, covers: { type: 'string' } } } },
  summary: { type: 'string' } } };

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const same = (a: string, b: string) => !!a && !!b && soundKey(romanize(a).toLowerCase().replace(/\s+ji$/, '')) === soundKey(romanize(b).toLowerCase().replace(/\s+ji$/, ''));

export async function scanImage(args: { persona: Persona; state: State; image: string; now?: Date }): Promise<{ scan: Scan; result: Result }> {
  const { persona: p, state } = args;
  const now = args.now ?? new Date();
  const t0 = Date.now();
  const contacts = p.contacts.map(c => ({ id: c.id, name: c.name, relation: c.rel, called: c.aliases }));
  const out = await jsonCall<Omit<Scan, 'sections' | 'issues'>>({
    name: 'scan', instructions: INSTRUCTIONS, effort: 'low', schema,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: `USER: ${p.name}, ${p.city}. ${p.about}\nTODAY: ${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}\nCONTACTS: ${JSON.stringify(contacts)}` },
      { type: 'input_image', image_url: args.image, detail: 'high' },
    ] }],
  });
  const lines: ScanLine[] = out.lines.map((l, i) => ({ ...l, n: i + 1, contact_id: p.contacts.some(c => c.id === l.contact_id) ? l.contact_id : '' }));
  for (const l of lines) if (!l.contact_id && l.party) l.contact_id = p.contacts.find(c => same(c.name, l.party) || c.aliases.some(a => same(a, l.party)))?.id ?? '';

  // ---- checks, all in code
  const issues: Issue[] = [];
  for (const l of lines) {   // 1) line maths: "2 × 180 = 380"
    const m = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(`${l.qty} ${l.text}`);
    const qty = m ? Number(m[1]) : 0, rate = m ? Number(m[2]) : l.rate;
    if (qty && rate && Math.abs(qty * rate - l.amount) >= 1) issues.push({ level: 'error', title: `Line ${l.n}: maths is off`, detail: `${qty} × ${rate} = ${inr(qty * rate)}, but ${inr(l.amount)} is written (${inr(Math.abs(l.amount - qty * rate))} ${l.amount > qty * rate ? 'extra' : 'short'}).`, lines: [l.n] });
  }
  for (const t of out.written_totals) {   // 2) written totals vs the lines they cover
    const kinds = KINDS.filter(k => t.covers.toLowerCase().includes(k)) as string[];
    const covered = lines.filter(l => (kinds.length ? kinds.includes(l.kind) : true));
    const sum = covered.reduce((s, l) => s + l.amount, 0);
    if (covered.length && Math.abs(sum - t.amount) >= 1) issues.push({ level: 'error', title: `“${t.label}” doesn’t add up`, detail: `Written ${inr(t.amount)}, but lines ${covered.map(l => l.n).join(', ')} add up to ${inr(sum)} (${inr(Math.abs(t.amount - sum))} ${t.amount > sum ? 'more' : 'less'} written).`, lines: covered.map(l => l.n) });
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {   // 3) the same line twice
    const a = lines[i], b = lines[j];
    if (a.amount === b.amount && a.kind === b.kind && (a.contact_id ? a.contact_id === b.contact_id : same(a.party, b.party)) && (a.party || a.contact_id) && romanize(a.item) === romanize(b.item))
      issues.push({ level: 'warn', title: `Lines ${a.n} and ${b.n} look the same`, detail: `${a.party || 'Same entry'} · ${a.item || a.kind} · ${inr(a.amount)} written twice. Written twice by mistake, or bought twice?`, lines: [a.n, b.n] });
  }
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(out.date) && out.date <= today ? out.date : today;
  const book = (state.book ?? []).filter(e => e.status !== 'dropped');
  for (const l of lines) {   // 4) already in the khata (so adding it again would double count)
    const hit = book.find(e => e.day === day && e.amount === l.amount && (l.contact_id ? e.contact_id === l.contact_id : same(e.party, l.party)));
    if (hit) issues.push({ level: 'warn', title: `Line ${l.n} is already in your khata`, detail: `${hit.party || l.party} ${inr(l.amount)} was added on ${hit.day}. It will not be added twice.`, lines: [l.n] });
  }
  for (const l of lines.filter(x => x.confidence < 0.6)) issues.push({ level: 'warn', title: `Line ${l.n}: amount is hard to read`, detail: `Read as ${inr(l.amount)}. Please check “${l.text}”.`, lines: [l.n] });
  const known = new Set(p.contacts.map(c => c.id));
  for (const l of lines.filter(x => x.party && !x.contact_id && x.kind !== 'sale')) issues.push({ level: 'info', title: `New name: ${l.party}`, detail: 'Not in your contacts. Artha will remember them with this entry.', lines: [l.n] });
  for (const id of new Set(lines.filter(l => l.kind === 'credit' && l.contact_id).map(l => l.contact_id))) {   // 5) running udhaar after this page
    const before = state.ledger.filter(x => x.contact === id).reduce((s, x) => s + x.amount, 0);
    const add = lines.filter(l => l.contact_id === id && l.kind === 'credit').reduce((s, l) => s + l.amount, 0);
    if (before && known.has(id)) issues.push({ level: 'info', title: `${p.contacts.find(c => c.id === id)!.name}: udhaar will be ${inr(before + add)}`, detail: `${inr(before)} was already due, ${inr(add)} more on this page.`, lines: lines.filter(l => l.contact_id === id).map(l => l.n) });
  }

  const sections: Section[] = KINDS.map(k => ({ kind: k, label: SECTION_LABEL[k], lines: lines.filter(l => l.kind === k).map(l => l.n), total: lines.filter(l => l.kind === k).reduce((s, l) => s + l.amount, 0) })).filter(s => s.lines.length);

  // ---- khata entries to add (lines already in the khata are left out)
  const dupOf = new Set(issues.filter(i => i.title.includes('already in your khata')).flatMap(i => i.lines));
  const kindMap: Record<string, EntryKind> = { sale: 'sale', credit: 'credit', received: 'received', purchase: 'purchase', paid: 'paid', to_pay: 'to_pay', to_receive: 'to_receive', expense: 'paid' };
  const planned: Action[] = lines.filter(l => !dupOf.has(l.n) && kindMap[l.kind] && l.amount > 0).map(l => ({
    type: 'ledger', contact_id: l.contact_id || 'none', contact_name: '', language: '', text: '', gloss: '', goal: '',
    title: `${l.item || l.text}`.slice(0, 60), when_iso: `${day}T12:00:00+05:30`, when_label: '', amount_inr: l.amount, predicted: false,
    why: `Line ${l.n} of the photo`, entry_kind: kindMap[l.kind], party: l.contact_id ? '' : l.party, item: l.item, updates: '',
  }));
  const { actions, checks } = checkActions(planned, p, now);

  // ---- what Artha says: numbers from code, in the user's language
  const errs = issues.filter(i => i.level !== 'info').length;
  const sales = sections.find(s => s.kind === 'sale')?.total ?? 0, credit = sections.find(s => s.kind === 'credit')?.total ?? 0;
  const mr = p.speaks[0] === 'Marathi', en = p.speaks[0] === 'English', ta = p.speaks[0] === 'Tamil';
  const reply = !lines.length ? out.summary
    : en ? `Read ${lines.length} lines: ${inr(sales)} cash sales, ${inr(credit)} on credit. ${errs ? `${errs} things to check.` : 'Everything adds up.'}`
    : mr ? `पान वाचलं: ${lines.length} नोंदी, ${inr(sales)} रोख विक्री, ${inr(credit)} उधारी. ${errs ? `${errs} गोष्टी तपासा.` : 'सगळं बरोबर आहे.'}`
    : ta ? `${lines.length} வரிகள் படித்தேன்: ரொக்க விற்பனை ${inr(sales)}, கடன் ${inr(credit)}. ${errs ? `${errs} விஷயங்களை சரிபாருங்கள்.` : 'எல்லாம் சரியாக உள்ளது.'}`
    : `पन्ना पढ़ लिया: ${lines.length} एंट्री, ${inr(sales)} नकद बिक्री, ${inr(credit)} उधार। ${errs ? `${errs} चीज़ें चेक कर लीजिए।` : 'सब सही है।'}`;
  const scan: Scan = { doc_type: out.doc_type, title: out.title, date: day, lines, written_totals: out.written_totals, sections, issues, summary: out.summary };
  const result: Result = {
    mode: 'artha', transcript: `📷 ${out.title}`, roman: '', language: p.speaks[0], entities: [], candidates: [], mentions: [], actions, clarify: null, blocked: false, checks,
    learn: [], reply, reply_speech: reply, refs: [],
    heard: { gist: out.title, points: [{ kind: 'item', text: `${lines.length} lines` }, ...sections.slice(0, 3).map(s => ({ kind: 'money', text: `${s.label.split(' (')[0]} ${inr(s.total)}` }))] }, topics: ['shop_credit'], ms: { meaning: Date.now() - t0, who: 0, plan: 0 },
  };
  return { scan, result };
}
export type { BookEntry };
