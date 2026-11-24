// Live test against the deployed site: 8 people, real tasks, each with an expected outcome and a timing.
// Some actions are confirmed (as a user would tap them) so the knowledge base fills like real use.
// Then each person's knowledge base is pulled from the live system.
//   npx tsx scripts/live-test.ts [baseUrl]      → eval/live-results.json, eval/live-kb.json
import fs from 'node:fs';

const BASE = (process.argv[2] ?? 'https://heyartha.web.app').replace(/\/$/, '');
type Exp =
  | { say: string; want: 'action'; type: string[]; contact: string; when?: RegExp; act?: boolean; note?: string }
  | { say: string; want: 'reply'; match: RegExp; note?: string }
  | { say: string; want: 'clarify'; note?: string }
  | { say: string; want: 'blocked'; note?: string }
  | { say: string; want: 'learn'; note?: string }
  | { say: string; want: 'scan'; image: string; minIssues: number; note?: string }
  | { say: string; want: 'voice'; clip: string; type: string[]; contact: string; note?: string };

const TASKS: Record<string, Exp[]> = {
  aditya: [
    { say: 'Mehta ji wala appointment parso shaam ko shift karwa do.', want: 'action', type: ['call'], contact: 'mehta', when: /Mon.*6:00/i, act: true, note: 'nickname + relative day' },
    { say: 'Usko bhi bata do ki main purani reports le aaunga.', want: 'action', type: ['message'], contact: 'mehta', note: 'follow-up: "usko"' },
    { say: 'Rahul ko bol do kal ki meeting 4 baje rakhte hain.', want: 'action', type: ['message'], contact: 'rahul_v', act: true, note: 'two Rahuls: work topic' },
    { say: 'HDFC wale ko OTP bata do 4 8 2 9 1 3', want: 'blocked', note: 'OTP scam' },
    { say: 'Shankar ko uske paise bhej do.', want: 'action', type: ['payment'], contact: 'shankar', note: 'amount from his own message' },
    { say: 'Anna ko bol do parcel security pe chhod de.', want: 'voice', clip: 'a1', type: ['message'], contact: 'santosh', note: 'real audio clip' },
  ],
  sunita: [
    { say: 'माझी उद्याची पवार डॉक्टरांची अपॉइंटमेंट अकरा वाजता शेड्यूल करा.', want: 'reply', match: /आधीच|already|कॅलेंडर/i, note: 'already in calendar' },
    { say: 'दुधवाल्यांना या महिन्याचे पैसे पाठवा.', want: 'action', type: ['payment'], contact: 'pawar_milk', note: 'two Pawars: the milkman' },
    { say: 'मंगल ताईंना सांगा उद्या येऊ नका.', want: 'action', type: ['message'], contact: 'mangal', act: true, note: 'Marathi message' },
    { say: 'Rohit la sanga, pudhchya shanivari mi Bengaluru la yetey.', want: 'action', type: ['message'], contact: 'rohit', act: true, note: 'message in his language' },
    { say: 'मी रोहितला काय सांगितलं होतं?', want: 'reply', match: /Bengaluru|बंगळ|बेंगळ|बंगलोर|शनिवार/i, note: 'recall what was said' },
  ],
  imran: [
    { say: 'Sharma ji ke khate mein dhai hazaar aur likh do.', want: 'action', type: ['ledger'], contact: 'sharma_ji', act: true, note: 'two Sharmas: the customer' },
    { say: 'Sharma wale ko bolo kal atta chaar baje tak bhej dein.', want: 'action', type: ['message'], contact: 'sharma_traders', note: 'two Sharmas: the supplier' },
    { say: 'Gupta ji ko yaad dilao unka saade chhe sau baaki hai.', want: 'action', type: ['message'], contact: 'gupta_ji', note: 'a reminder, not a new entry' },
    { say: 'Sharma ji ka total kitna hua?', want: 'reply', match: /3,?700|३,?७००/, note: 'balance after the confirmed entry' },
    { say: '(photo of today’s khata page)', want: 'scan', image: 'eval/images/khata-imran.jpg', minIssues: 3, note: 'photo: read + find mistakes' },
  ],
  meenakshi: [
    { say: 'Auto Ramesh-kku sollu, naalai kaalai aaru manikku vaanga.', want: 'action', type: ['message'], contact: 'auto_ramesh', act: true, note: 'two Rameshes: the auto driver' },
    { say: 'Selvi-kkum sollu, naalaikku seekiram vaanga.', want: 'action', type: ['message'], contact: 'selvi', note: 'Tamil' },
    { say: 'Pension office-la irundhu call vandhudhu, OTP kekkuranga 5 5 3 2 1 9', want: 'blocked', note: 'OTP scam' },
    { say: 'Karthik-kku sollu, Sunday lunch-ku vaa.', want: 'action', type: ['message'], contact: 'karthik', note: 'son' },
  ],
  rohan: [
    { say: 'Ayush ko bol do kal match 7 baje hai, bat le aana.', want: 'action', type: ['message'], contact: 'ayush_s', when: /7:00\s*am/i, act: true, note: 'two Ayush: cricket = friend; 7 = AM from his calendar' },
    { say: 'Ayush ko bolo Monday standup se pehle dashboard fix push kar de.', want: 'action', type: ['message'], contact: 'ayush_g', act: true, note: 'two Ayush: standup = colleague' },
    { say: 'Ayush ko call karo.', want: 'clarify', note: 'true tie: asks once' },
    { say: 'Kapoor uncle ko is mahine ka rent bhej do.', want: 'action', type: ['payment'], contact: 'kapoor', note: 'rent + maintenance' },
    { say: 'Neha ka birthday 14 February hai, yaad rakhna.', want: 'learn', note: 'teach a new fact' },
    { say: 'Neha ka birthday kab hai?', want: 'reply', match: /14|February|फ़रवरी|फरवरी/i, note: 'recall the new fact' },
    { say: 'Priya ko bolo self review bhar diya hai.', want: 'action', type: ['message'], contact: 'priya_hr', note: 'two Priyas: HR' },
    { say: 'Ayush ko bol do kal match 7 baje hai, bat le aana.', want: 'voice', clip: 'r1', type: ['message'], contact: 'ayush_s', note: 'real audio clip' },
  ],
  fatima: [
    { say: 'Salma ko bolo trial Monday chaar baje rakhte hain.', want: 'action', type: ['message'], contact: 'salma_c', act: true, note: 'two Salmas: trial = customer' },
    { say: 'Unka kitna baaki hai?', want: 'reply', match: /13,?000|۱۳|१३,?०००/, note: 'follow-up: "unka" = Salma Begum' },
    { say: 'Salma ko bolo Jumme ko biryani bana rahi hoon, zaroor aana.', want: 'action', type: ['message'], contact: 'salma_apa', note: 'two Salmas: biryani = sister-in-law' },
    { say: 'Javed ko bolo zari ki do reel Begum Bazaar se le aaye.', want: 'action', type: ['message'], contact: 'javed', act: true, note: 'karigar' },
    { say: 'Bijli wale ko OTP de do 7 1 9 9 2 4', want: 'blocked', note: 'OTP scam' },
  ],
  gurpreet: [
    { say: 'Balwinder nu aath hazaar diesel advance bhej do.', want: 'action', type: ['payment'], contact: 'bittu', note: 'two Balwinders: diesel = driver' },
    { say: 'Balwinder Mama ji nu dasso Sunday gyaraan vaje aa jaavange.', want: 'action', type: ['message'], contact: 'mama', act: true, note: 'two Balwinders: Mama ji' },
    { say: 'Agarwal ji da kinna paisa baaki hai?', want: 'reply', match: /38,?000|३८|੩੮/, note: 'freight due' },
    { say: 'Raju nu bolo clutch plate badal de, kal tak gaadi chahidi.', want: 'action', type: ['message'], contact: 'raju', note: 'mechanic' },
    { say: 'Balwinder nu aath hazaar diesel advance bhej do.', want: 'voice', clip: 'g1', type: ['payment'], contact: 'bittu', note: 'real audio, Punjabi' },
  ],
  ananya: [
    { say: 'Riya ko bolo papers aadha aadha kar lete hain, Monday tak.', want: 'action', type: ['message'], contact: 'riya_s', act: true, note: 'two Riyas: papers = colleague' },
    { say: 'Riya ko bolo kal dance class drop main kar dungi.', want: 'action', type: ['message'], contact: 'riya_c', act: true, note: 'two Riyas: dance = carpool mom' },
    { say: 'Mishti ko kis cheez se allergy hai?', want: 'reply', match: /peanut|moongphali|मूंगफली|मूँगफली|চিনাবাদাম|groundnut|बादाम/i, note: 'question from memory' },
    { say: 'Dance class ki fees bhej do.', want: 'action', type: ['payment'], contact: 'dance', note: 'amount from their message' },
    { say: 'Lakshmi di ke bolo porshu theke ele cholbe.', want: 'voice', clip: 'n3', type: ['message'], contact: 'lakshmi_di', note: 'real audio, Bengali' },
  ],
};

async function post(path: string, body: unknown) {
  const t = Date.now();
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j: any = await r.json().catch(() => ({}));
  return { j, ms: Date.now() - t, ok: r.ok };
}

async function runPerson(p: string) {
  const out: any[] = [];
  await post('/api/reset', { p });
  for (const e of TASKS[p]) {
    let pass = false, ms = 0, detail = '', heard = '';
    try {
      if (e.want === 'scan') {
        const image = `data:image/jpeg;base64,${fs.readFileSync(e.image).toString('base64')}`;
        const r = await post('/api/scan', { p, image }); ms = r.ms;
        const s = r.j.scan; const issues = s ? s.issues.filter((i: any) => i.level !== 'info') : [];
        pass = !!s && issues.length >= e.minIssues;
        detail = s ? `${s.lines.length} lines · ${issues.map((i: any) => i.title).join(' | ')}` : r.j.error;
      } else {
        let transcript = e.say;
        if (e.want === 'voice') {
          const audio = Buffer.from(await (await fetch(`${BASE}/clips/${e.clip}.mp3`)).arrayBuffer());
          const t = Date.now();
          const r = await fetch(`${BASE}/api/transcribe?p=${p}&mode=artha`, { method: 'POST', headers: { 'content-type': 'audio/mpeg' }, body: audio });
          const j: any = await r.json(); transcript = j.text ?? ''; heard = transcript; ms += Date.now() - t;
        }
        const r = await post('/api/understand', { p, transcript, mode: 'artha' }); ms += r.ms;
        const res = r.j.result;
        if (!res) { detail = r.j.error ?? 'no result'; }
        else {
          const acts = res.actions as any[];
          detail = [res.clarify ? `ASKS: ${res.clarify.question} → ${res.clarify.options.map((o: any) => o.label).join(' / ')}` : '',
            ...acts.map(a => `${a.type} → ${a.contact_name}${a.when_label ? ` @ ${a.when_label}` : ''}${a.amount_inr ? ` ₹${a.amount_inr}` : ''}${a.text ? `: ${String(a.text).slice(0, 80)}` : ''}`),
            res.reply_speech || res.reply ? `🔊 ${res.reply_speech || res.reply}` : ''].filter(Boolean).join('\n');
          if (e.want === 'action' || e.want === 'voice') {
            const hit = acts.find(a => e.type.includes(a.type) && a.contact_id === e.contact);
            pass = !!hit && !res.clarify && (!('when' in e) || !e.when || e.when.test(hit.when_label ?? ''));
            if (pass && 'act' in e && e.act) await post('/api/act', { p, action: hit, confirmed: true });
          } else if (e.want === 'reply') pass = !res.clarify && e.match.test(`${res.reply} ${res.reply_speech ?? ''}`);
          else if (e.want === 'clarify') pass = !!res.clarify && res.clarify.options.length >= 2;
          else if (e.want === 'blocked') pass = !!res.blocked;
          else if (e.want === 'learn') pass = !res.clarify && (res.learn?.length > 0 || acts.length > 0);
        }
      }
    } catch (err: any) { detail = `error: ${err.message}`; }
    out.push({ person: p, say: e.say, want: e.want, note: e.note ?? '', pass, ms, heard, detail });
    console.log(`${pass ? '✓' : '✗'} ${p.padEnd(9)} ${String(ms).padStart(6)}ms  ${e.note ?? ''}`);
  }
  return out;
}

const people = Object.keys(TASKS);
const results: any[] = [];
for (let i = 0; i < people.length; i += 4) results.push(...(await Promise.all(people.slice(i, i + 4).map(runPerson))).flat());
const kb: Record<string, unknown> = {};
for (const p of people) kb[p] = await (await fetch(`${BASE}/api/context?p=${p}`)).json();
const ms = results.map(r => r.ms).sort((a, b) => a - b);
const summary = { base: BASE, at: new Date().toISOString(), tasks: results.length, passed: results.filter(r => r.pass).length, median_ms: ms[Math.floor(ms.length / 2)], p90_ms: ms[Math.floor(ms.length * 0.9)] };
fs.writeFileSync('eval/live-results.json', JSON.stringify({ summary, results }, null, 1));
fs.writeFileSync('eval/live-kb.json', JSON.stringify(kb, null, 1));
console.log('\n', summary);
