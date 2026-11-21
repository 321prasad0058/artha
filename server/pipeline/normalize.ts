// Stage 2 (code): Indian dates, times and amounts → exact values.
// Works on romanised, lower-case text (see translit.ts), across Hindi, Marathi, Telugu, Tamil and English.
// Plain code on purpose: these must be exact and testable, so the model never guesses "dhai sau".
import type { Entity } from '../types.js';

const TZ = 'Asia/Kolkata';

const NUM: Record<string, number> = {
  // Hindi / Urdu
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, dus: 10, gyarah: 11, gyaarah: 11, barah: 12, baarah: 12,
  bees: 20, pachas: 50, pachaas: 50,
  // Marathi
  don: 2, paach: 5, saha: 6, sahaa: 6, daha: 10, dahaa: 10, akra: 11, akraa: 11, bara: 12, baaraa: 12, naoo: 9, nava: 9,
  // Tamil as it comes out of the script
  irandu: 2, moonru: 3, naanku: 4, aindu: 5, onpathu: 9, paththu: 10, pannirandu: 12,
  // Telugu
  okati: 1, rendu: 2, moodu: 3, mudu: 3, naalugu: 4, nalugu: 4, aidu: 5, aaru: 6, aru: 6, edu: 7, enimidi: 8, tommidi: 9, padi: 10, padakondu: 11, pannendu: 12,
  // Tamil
  onnu: 1, onru: 1, moonu: 3, munu: 3, naalu: 4, nalu: 4, anju: 5, ainthu: 5, ezhu: 7, ettu: 8, ombodhu: 9, onbathu: 9, pathu: 10, padinonnu: 11, pannirendu: 12,
};
const numOf = (w: string): number | null => (/^\d+(\.\d+)?$/.test(w) ? Number(w) : NUM[w] ?? null);

const DAY_WORDS: [RegExp, number, string][] = [
  [/\b(aaj|aj|today|ivvala|eeroju|eroju|indru|inniki|innaikku|aaja)(chi|chee|chaa|cha|chya|chyaa|che|ch|la|laa|ti|tee|nchi)?\b/, 0, 'today'],
  [/\b(parso|parson|parsoon|ellundi|parva|parwa|day after tomorrow|naalai marunaal|nalaiku marunaal|marunaal)(chi|chee|chaa|cha|chya|chyaa|che|ch|la|laa|ti|tee|nchi)?\b/, 2, 'day after tomorrow'],
  [/\b(narso|narson|tarvadi|tarwadi)(chi|chee|chaa|cha|chya|chyaa|che|ch|la|laa|ti|tee|nchi)?\b/, 3, 'in 3 days'],
  [/\b(kal|kaal|tomorrow|repu|reypu|udya|udyaa|uddya|repati|naalai|nalai|naalaikku|nalaikku|naalaiku|nalaiku)(chi|chee|chaa|cha|chya|chyaa|che|ch|la|laa|ti|tee|nchi)?\b/, 1, 'tomorrow'],
];
const WEEKDAYS: [RegExp, number][] = [
  [/\b(sunday|ravivar|itvaar|itwar|aadivaram|adivaram|nyayiru|gnayiru|ravivari)\b/, 0],
  [/\b(monday|somvar|somwar|somavaram|thingal|thinkal|somvari)\b/, 1],
  [/\b(tuesday|mangalvar|mangalwar|mangalavaram|sevvai)\b/, 2],
  [/\b(wednesday|budhvar|budhwar|budhavaram|budhan)\b/, 3],
  [/\b(thursday|guruvar|guruvaar|brihaspativar|guruvaram|viyazhan)\b/, 4],
  [/\b(friday|shukravar|shukrawar|sukravaram|velli)\b/, 5],
  [/\b(saturday|shanivar|shaniwar|shanivaram|sani)\b/, 6],
];
const PARTS: [RegExp, number, string][] = [
  [/\b(subah|subha|savere|morning|poddunna|podduna|sakali|sakaali|sakaalee|udayam|udayan|kaalai|kalai|kaalaila)\b/, 9, 'morning'],
  [/\b(dopahar|dupahar|madhyanam|madhyaanam|dupari|duparchya|afternoon|madhiyam|mathiyam|dupaaree|dupari|madhyaahnam|madhyaahnan|madhyahnam)\b/, 13, 'afternoon'],
  [/\b(shaam|sham|evening|saayantram|sayantram|sandhyakali|sandhyakaali|saayankaalam|sayankalam|maalai|saayantran|sandhyaakaalee|sandhyakaalee)\b/, 18, 'evening'],
  [/\b(raat|rat|night|ratri|raatri|raatree|rathri|iravu|dinner)\b/, 21, 'night'],
];
// "4 baje", "4 vajta", "4 gantalaki", "4 manikku", "4 pm"
const UNIT = '(sau|she|shey|hazaar|hazar|hajar|hajaar|lakh|laakh|lac|lakhs|vandalu|vanda|veyyi|velu|nooru|aayiram|ayiram|rupaye|rupees|rupay|rs)';
const CLOCK = '(baje|bajey|bje|vajta|vajata|vajto|vaajtaa|vaajta|vajtaa|gantalaki|gantalaku|gantala|ganta|manikku|maniku|mani|o clock|oclock|pm|am)';

function nowIST(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}
function addDays(base: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: { y: number; m: number; d: number }, h = 0, mi = 0) => `${d.y}-${pad(d.m)}-${pad(d.d)}T${pad(h)}:${pad(mi)}:00+05:30`;
export function labelOf(iso: string, withTime = true) {
  const dt = new Date(iso);
  const day = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
  if (!withTime) return day;
  return `${day}, ${dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).replace(' ', ' ')}`;
}

export type Normalised = { entities: Entity[]; when?: { iso: string; label: string } };

export function normalise(roman: string, now = new Date()): Normalised {
  const text = ` ${roman.toLowerCase().replace(/[^\p{L}\p{N}₹\s.]/gu, ' ').replace(/\s+/g, ' ')} `;
  const entities: Entity[] = [];
  const today = nowIST(now);

  // ---- day
  let dayOffset: number | null = null;
  for (const [re, add, label] of DAY_WORDS) {
    const m = text.match(re);
    if (m) {
      // "kal / kaal" is yesterday when the sentence is in the past tense ("kaal vikla", "kal hua tha", "jhalya").
      if (add === 1 && /^(kal|kaal)/.test(m[1]) && /\b(yesterday|jh?aal\w*|zaal\w*|hot(a|aa|e|i|ya|yaa)|vikl\w*|gel\w*|ghetl\w*|dil(a|aa|e|i|ya|yaa)|kel(a|aa|e|i|ya|yaa)|thaa?|thi|the|hua|huaa|hui|hue|gay(a|aa|i|ii)|kiy(a|aa)|bech(a|aa)|bik(a|aa))\b/.test(text)) {
        dayOffset = -1; entities.push({ text: m[0].trim(), kind: 'date', label: `yesterday → ${labelOf(isoOf(addDays(today, -1)), false)}`, iso: isoOf(addDays(today, -1)) }); break;
      }
      dayOffset = add; entities.push({ text: m[0].trim(), kind: 'date', label: `${label} → ${labelOf(isoOf(addDays(today, add)), false)}`, iso: isoOf(addDays(today, add)) }); break; }
  }
  if (dayOffset === null) {
    for (const [re, wd] of WEEKDAYS) {
      const m = text.match(re);
      if (m) {
        const cur = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
        let add = (wd - cur + 7) % 7; if (add === 0) add = 7;
        dayOffset = add;
        entities.push({ text: m[0].trim(), kind: 'date', label: `next ${m[0].trim()} → ${labelOf(isoOf(addDays(today, add)), false)}`, iso: isoOf(addDays(today, add)) });
        break;
      }
    }
  }

  // ---- time of day
  let hour: number | null = null, minute = 0, timeText = '';
  const frac = text.match(new RegExp(`\\b(saadhe|sadhe|saade|sade|saarhe|paune|pone|sava|savaa|savva|sawa)\\s+(\\w+)(\\s+${CLOCK})?\\b`));
  const half = text.match(new RegExp(`\\b(dedh|derh|dhai|dhaai|dhaaee|adhai|adich)\\s+${CLOCK}\\b`));
  const plain = text.match(new RegExp(`\\b(\\d{1,2}|${Object.keys(NUM).join('|')})(?:[:.](\\d{2}))?\\s*${CLOCK}\\b`));
  const moneyNext = (m: RegExpMatchArray | null) => !!m && new RegExp(`^\\s*${UNIT}\\b`).test(text.slice((m.index ?? 0) + m[0].length));
  if (frac && !moneyNext(frac) && numOf(frac[2]) !== null && numOf(frac[2])! <= 12) {
    const n = numOf(frac[2])!; const k = frac[1];
    if (k === 'paune' || k === 'pone') { hour = n - 1; minute = 45; }
    else if (/^(saadhe|sadhe|saade|sade|saarhe)$/.test(k)) { hour = n; minute = 30; }
    else { hour = n; minute = 15; } // sava
    timeText = frac[0].trim();
  } else if (half) {
    hour = /^(dedh|derh)$/.test(half[1]) ? 1 : 2; minute = 30; timeText = half[0].trim();
  } else if (plain && numOf(plain[1]) !== null && numOf(plain[1])! <= 23) {
    hour = numOf(plain[1])!; minute = plain[2] ? +plain[2] : 0; timeText = plain[0].trim();
    if (/pm/.test(plain[3]) && hour < 12) hour += 12;
    if (/am/.test(plain[3]) && hour === 12) hour = 0;
  }
  const part = PARTS.find(p => p[0].test(text));
  if (hour !== null) {
    if (part && part[1] >= 13 && hour < 12) hour += 12;
    else if (part && part[1] === 9 && hour === 12) hour = 0;
    else if (!part && hour >= 1 && hour <= 7 && !/\bam\b/.test(timeText)) hour += 12; // "4 baje" for a plan means 4 PM
    else if (!part && dayOffset === null && hour >= 8 && hour <= 11 && !/\b(am|pm)\b/.test(timeText) && hour + 12 > today.h) {
      // "saadhe aath baje" said in the afternoon: the next 8:30 is tonight
      if (hour < today.h || (hour === today.h && minute <= today.min)) hour += 12;
    }
    entities.push({ text: timeText, kind: 'time', label: `${hour % 12 || 12}:${pad(minute)} ${hour >= 12 ? 'PM' : 'AM'}` });
  } else if (part) {
    const m = text.match(part[0])!;
    hour = part[1];
    entities.push({ text: m[0].trim(), kind: 'time', label: `${part[2]} → around ${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}` });
  }

  // ---- money
  const unit = '(sau|she|shey|hazaar|hazar|hajar|hajaar|lakh|laakh|lac|lakhs|vandalu|vanda|veyyi|velu|nooru|aayiram|ayiram|rupaye|rupees|rupay|rs)';
  const halfAmt = text.match(new RegExp(`\\b(saadhe|sadhe|saade|sade|saarhe)\\s+(\\w+)\\s+${unit}\\b`));
  const amt = halfAmt && numOf(halfAmt[2]) !== null ? null : text.match(new RegExp(`\\b(dhai|dhaai|dhaaee|dhaee|adhai|adich|dedh|derh|sava|savaa|savva|sawa|saadhe|sadhe|saarhe|paune|\\d+(?:\\.\\d+)?|${Object.keys(NUM).join('|')})\\s*${unit}\\b`))
    ?? text.match(/\b(adichshe|dedhshe|savvashe)\b/);
  if (halfAmt && numOf(halfAmt[2]) !== null) {
    const u = halfAmt[3];
    const mul = /^(sau|she|shey|vandalu|vanda|nooru)$/.test(u) ? 100 : /^(hazaar|hazar|hajar|hajaar|veyyi|velu|aayiram|ayiram)$/.test(u) ? 1000 : /^(lakh|laakh|lac|lakhs)$/.test(u) ? 100000 : 1;
    const amount = Math.round((numOf(halfAmt[2])! + 0.5) * mul);
    entities.push({ text: halfAmt[0].trim(), kind: 'money', label: `₹${amount.toLocaleString('en-IN')}`, amount });
  } else if (amt) {
    let n: number | null = null; let mul = 1; const w = amt[1];
    if (/adichshe/.test(amt[0])) { n = 2.5; mul = 100; }
    else if (/dedhshe/.test(amt[0])) { n = 1.5; mul = 100; }
    else if (/savvashe/.test(amt[0])) { n = 1.25; mul = 100; }
    else {
      n = /^(dhai|dhaai|dhaaee|dhaee|adhai|adich)$/.test(w) ? 2.5 : /^(dedh|derh)$/.test(w) ? 1.5 : /^(sava|savaa|savva|sawa)$/.test(w) ? 1.25 : /^(saadhe|sadhe|saarhe|paune)$/.test(w) ? null : numOf(w);
      const u = amt[2];
      mul = /^(sau|she|shey|vandalu|vanda|nooru)$/.test(u) ? 100 : /^(hazaar|hazar|hajar|hajaar|veyyi|velu|aayiram|ayiram)$/.test(u) ? 1000 : /^(lakh|laakh|lac|lakhs)$/.test(u) ? 100000 : 1;
    }
    if (n !== null) {
      const amount = Math.round(n * mul);
      entities.push({ text: amt[0].trim(), kind: 'money', label: `₹${amount.toLocaleString('en-IN')}`, amount });
    }
  } else {
    const r = text.match(/₹\s?(\d[\d,]*)/);
    if (r) { const amount = Number(r[1].replace(/,/g, '')); entities.push({ text: r[0].trim(), kind: 'money', label: `₹${amount.toLocaleString('en-IN')}`, amount }); }
  }

  // ---- combined "when"
  let when: Normalised['when'];
  if (dayOffset !== null || hour !== null) {
    let d = dayOffset ?? 0;
    const h = hour ?? 10;
    if (dayOffset === null && hour !== null && (h < today.h || (h === today.h && minute <= today.min))) d = 1; // "4 baje" said at 6 PM means tomorrow
    const iso = isoOf(addDays(today, d), h, minute);
    when = { iso, label: hour === null ? labelOf(iso, false) : labelOf(iso) };
  }
  return { entities, when };
}
