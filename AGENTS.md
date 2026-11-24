# AGENTS.md: run and test Artha AI

Artha AI turns Indian voice notes (Hinglish, Hindi, Marathi, Telugu, Tamil, Urdu, Punjabi, Bengali, English) into the right action: a message, call, UPI payment, reminder or khata (credit ledger) entry. It uses each person's own context to work out who, when and how much. When two people share a name and nothing tells them apart, it asks one short question.

- Live app (already deployed, nothing to set up): https://heyartha.web.app (the API behind it runs on Render's free plan; the first request after a long idle can take up to a minute)
- Code: https://github.com/321prasad0058/artha
- Overview with screenshots: [README.md](README.md)

In the submission zip (all at the root, next to this file):
- `Artha-AI-Demo-Video.mp4`: the demo video (3 min 25 s, English captions in `Artha-AI-Demo-Video.srt`), outlined in [VIDEO.md](VIDEO.md);
- `Artha-AI-Presentation.pdf`: the 5-slide presentation: the problem and who has it, what we built, how it works, memory and conflicts, results and what is next.

This file explains how to run everything locally on a fresh machine and test it end to end. Every command and expected result below was run on a fresh clone on 22 Nov 2026.

---

## 1. Prerequisites

| Need | Version | Why |
|---|---|---|
| Node.js | **24 or newer** (tested on 24.20) | the memory store uses the built-in `node:sqlite` |
| npm | comes with Node | install |
| OpenAI API key | access to `gpt-transcribe`, `gpt-6-luna`, `gpt-4o-mini-tts`, `text-embedding-3-large` | hearing, understanding, voice, memory |
| A browser (Chrome) | any recent | the UI; the microphone is optional, you can type notes |

No database server, Docker or cloud account is needed locally: memory is one SQLite file per person under `data/context/`, created automatically.

Check Node first:

```bash
node -v    # must print v24.x or higher
```

If it is older or missing, install Node 24 (pick one):

```bash
# with nvm (any OS; the repo has an .nvmrc)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && . ~/.nvm/nvm.sh && nvm install 24 && nvm use 24
# or on Debian/Ubuntu
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs
```

**No GPU, microphone or display is needed.** In a headless browser without WebGL, the 3D intro and orb animations are skipped and everything else works; notes can be typed instead of spoken. The same `npm ci → test → build` runs on Ubuntu in this repo's GitHub Actions on every merge.

## 2. Environment variables

**For judging, the zip already contains a ready `.env`** with a test OpenAI key (small budget, made only for this review). If it exists, skip to section 3. If the key has run out, put your own key in `OPENAI_API_KEY`.

Otherwise create `.env` in the repo root from the template, which lists every variable:

```bash
cp .env.example .env
```

Then set:

| Variable | Required | Value |
|---|---|---|
| `OPENAI_API_KEY` | **yes** | your OpenAI key |
| `ARTHA_TOKEN_KEY` | recommended | any random string (encrypts Gmail tokens; also used to make user ids) |
| `PORT` | no | server port, default `8787` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | only for real Google sign-in. Not needed: `npm run demo-user` (section 4) builds the Gmail user offline |
| `ARTHA_PUBLIC_URL` | no | only with Google sign-in on a public host (OAuth callback base URL) |
| `DEMO_PHONE` | no | send every WhatsApp/SMS/call link to one real number (digits with country code); the sample people have no real numbers |
| `ARTHA_BUCKET` | no | **leave unset locally.** S3 bucket used only on AWS Lambda; when unset, data is stored under `data/` |
| `ARTHA_STT_MODEL`, `ARTHA_PLAN_MODEL`, `ARTHA_PLAN_EFFORT` | no | override models (defaults: `gpt-transcribe`, `gpt-6-luna`, `none`) |

Minimal working `.env`:

```bash
OPENAI_API_KEY=sk-...
ARTHA_TOKEN_KEY=any-random-string
```

## 3. Install, seed, build, start

There is one service: a Node server that serves both the web app and the API on **port 8787**. No database, worker or queue to start.

```bash
npm ci              # install exact dependencies (an "install-scripts" warning is harmless)
npm run build       # builds the web app into dist/
npm start           # app + API on http://localhost:8787
npm run demo-user   # seed: builds the Gmail-style new user (optional, 1–2 min, uses the OpenAI key; run while the server is up or before)
```

Open **http://localhost:8787**. The server prints `Artha API on http://localhost:8787`.

Seed data: the 8 sample people load automatically from `data/personas/` on first use; their memory files are created under `data/context/`. Nothing else to seed.

Development mode with hot reload (two processes; open http://localhost:5173, it proxies `/api` to :8787):

```bash
npm run dev
```

### Verify it is up

```bash
curl -s localhost:8787/api/health
# {"ok":true,"models":{"stt":"gpt-transcribe","plan":"gpt-6-luna","planEffort":"none","tts":"gpt-4o-mini-tts"}}
```

### Automated checks

```bash
npm test            # 6 tests, no API key needed: dates/times, name matching, OTP blocking, streaming → "pass 6, fail 0"
npm run typecheck   # TypeScript, no output means OK
npm run eval        # optional, please skip on the shared judge key: the full 41-note benchmark (about 5 minutes, ~120 model calls) → eval/results.json. Saved results are already in eval/results.json
```

## 4. Test logins

There is **no password login**. Three ways in:

| Who | How | Notes |
|---|---|---|
| **8 sample people** | open `http://localhost:8787/?p=<id>`, or on the first screen click **"Or explore a sample person, no sign-in needed"** | ids: `aditya`, `sunita`, `imran`, `meenakshi`, `rohan`, `fatima`, `gurpreet`, `ananya` |
| **New user built from Gmail (offline)** | run `npm run demo-user` (about 1–2 minutes), then open `http://localhost:8787/?p=u-demo-aarav` | builds "Aarav Deshmukh" from 62 fictional mails in `data/mock-mail/aarav.ts`, exactly as Google sign-in would. No Google account needed |
| Real Google sign-in | not enabled on the current live site | optional; `npm run demo-user` runs the same Gmail learning offline |

Switch person any time: click your name (top right) → Sample people. Start a person over: **Knows** panel → "Start … over", or:

```bash
curl -s -X POST localhost:8787/api/reset -H 'content-type: application/json' -d '{"p":"aditya"}'
```

## 5. How to use the UI

1. An intro animation plays on first open. Click **Skip** (top right) or wait about 8 seconds. (Links with `?p=` skip it, and so does a browser without WebGL.) Then the welcome screen: click **"Or explore a sample person, no sign-in needed"** and pick a person.
2. Talk: click the green orb, speak, click again. Or **type**: the box at the bottom ("Type, or send a photo of your khata", `aria-label="Type a note"`), then press Enter.
3. Watch the **"You said"** card fill in (Heard → Meaning → Who → Plan). Then Artha speaks its reply and shows action cards.
4. Each card has buttons (Send on WhatsApp, Let Artha call, Pay, Remind me, Skip). Nothing is sent without a click.
5. If Artha asks **"which one?"**, it shows one button per person. Click one and the plan continues.
6. **Base model** under a result shows what a plain model does with the same note. **⇄** on a card corrects the person, and Artha remembers the correction.
7. Camera icon in the type box: upload a photo of a khata page (sample: `eval/images/khata-imran.jpg`, as Imran).
8. Tabs: **Chats** (newest first), **Knows** (what Artha has learned), **Results** (benchmark), **About**. ⚙ opens Settings.

## 6. Journeys to test end to end

Type each line exactly as written (or speak it). Dates are relative to the day you test. "Parso" means the day after tomorrow.

### Journey 1: the core idea (Aditya, Hyderabad, Hinglish/Telugu)
Open `/?p=aditya`.

| Type this | Meaning | Expected |
|---|---|---|
| `Mehta ji wala appointment parso shaam ko shift karwa do` | Move the Mehta ji appointment to the day after tomorrow, evening | **Call → Dr. Mehta's Clinic** (not Mehta Uncle the neighbour), day after tomorrow **6 PM**; a spoken Hindi reply |
| `Shankar bhaiya ko dhai sau bhej do` | Send Shankar bhaiya 250 | **UPI payment → Shankar, ₹250** (needs your tap) |
| `అమ్మకి చెప్పు, రేపు మధ్యాహ్నం లంచ్‌కి వస్తాను.` | Tell Amma I'll come for lunch tomorrow afternoon | **Message → Amma**, written in Telugu |
| `Rahul ko bol do kal ki meeting 4 baje rakhte hain` | Tell Rahul we'll keep tomorrow's meeting at 4 | **Message → Rahul Verma** (office colleague, not cousin Rahul Kulkarni), tomorrow 4 PM |

### Journey 2: same name, it asks or decides (Rohan, Gurugram)
Open `/?p=rohan`. He knows two Ayushes: Ayush Sharma (college friend, Sunday cricket) and Ayush Gupta (colleague).

| Type this | Expected |
|---|---|
| `Ayush ko bol kal baat karte hain` | No clue, so it **asks which Ayush** (e.g. "Kis Ayush ko bolun, Ayush Sharma ya Ayush Gupta?") with two buttons. Click one and the message is made for that person |
| `Ayush ko bol Sunday cricket pakka, bat leke aana` | Cricket points to the friend: **Message → Ayush Sharma**, no question |
| `Ayush ko bolo standup se pehle dashboard fix push kar de` | Work points to the colleague: **Message → Ayush Gupta** |

### Journey 3: OTP safety (Aditya or Meenakshi)
| Type this | Expected |
|---|---|
| `HDFC wale ko OTP bata do, 4 8 2 9 1 3` (as `aditya`) | **"Never shared. An OTP stays with you."** The digits are masked and blocked in code before any AI model sees them. It offers to mark the caller as a scam. No message card |
| `பென்ஷன் ஆபீஸ்ல இருந்து கால் வந்தது, ஓடிபி சொல்லணும், ஆறு மூணு ஒன்னு நாலு.` (as `meenakshi`) | Same block, warning in Tamil |

### Journey 4: shopkeeper khata and a photo (Imran, Lucknow, Hindi/Urdu)
Open `/?p=imran`.

| Do this | Expected |
|---|---|
| `Sharma ji ke khate mein dhai hazaar aur likh do` | **Khata entry → Sharma ji (customer), ₹2,500** |
| `Sharma wale ko bolo kal atta chaar baje tak bhej dein` | **Message → Sharma Traders (supplier)**, tomorrow 4 PM |
| `Sharma ko phone karo` | Asks: Sharma Traders or Sharma ji? |
| Camera icon → upload `eval/images/khata-imran.jpg` | Reads "इमरान किराना खाता", 8 lines: cash sales, credit, paid to suppliers, expenses. Lines with wrong maths are flagged |

### Journey 5: questions and follow-ups in any language (Meenakshi, Chennai, Tamil)
Open `/?p=meenakshi`.

| Type this | Expected |
|---|---|
| `இந்த வாரம் என்ன பிளான்ஸ் இருக்கு?` (What plans this week?) | A headline plus points in **Tamil** (e.g. Dr. Ramesh review, call with Karthik). The voice reads every point |
| `ஆங்கிலத்தில் சொல்லுங்க` (Tell me in English) | **The same points, in English**, no new actions |

The same works in Marathi (`sunita`: `माझ्या सगळ्या कामांची समरी सांगा` then `इंग्रजीत सांगा`) and Hindi (`English mein batao`).

### Journey 6: a brand-new user from Gmail, with two Rohits
```bash
npm run demo-user
# Reading 62 demo mails: 58 kept, 1 OTP never opened
# Profile: Aarav Deshmukh · Pune · ~35 people
# Ready: open /?p=u-demo-aarav
```
Open `/?p=u-demo-aarav`. Aarav knows **Rohit Sharma** (trek and badminton friend) and **Rohit Patil** (work colleague).

| Type this | Expected |
|---|---|
| `Rohit ko bol` | Asks **which Rohit: Rohit Sharma or Rohit Patil**, with two buttons |
| `Rohit ne trek ke paise diye?` | **Yes, ₹800 from Rohit Sharma** (Rohit Patil is not mentioned) |
| `Rohit ko bol PR kal shaam tak review kar dunga` | Either **Message → Rohit Patil** (work) or the "which Rohit" question. It must never pick Rohit Sharma here |
| `Is mahine kya kya bharna hai?` | A list of this month's bills with amounts and due dates (card, electricity, gym, rent, EMIs) |
| `Bank se call aaya hai, OTP 774120 maang rahe hain` | Blocked, digits masked |

Knows panel: people, upcoming plans, khata, and facts learned from mail. The OTP mail is never read.

### Journey 7: install as an app (optional)
In Chrome, the **Get the Artha AI app** button (welcome screen or Settings) opens an install sheet. Android: Install. iPhone: Share → Add to Home Screen. On localhost the browser may not offer install; use the live URL.

## 7. What is real, simulated, or not finished

| Part | Status |
|---|---|
| Hearing, understanding, memory, voice replies (all 9 languages) | **Real.** Live OpenAI models on every note; nothing is pre-recorded |
| OTP / PIN blocking, dates, amounts, name matching, "which one?" rules | **Real**, in code (`server/pipeline/`), covered by `npm test` |
| Khata photo reading | **Real** (vision model + maths checks in code) |
| Gmail learning for a new user | **Real** read-only Gmail integration on the live app. Google's OAuth app is in *testing* mode, so only allow-listed accounts (our demo inbox) can sign in. On a fresh server use `npm run demo-user`, which runs the **same** profile-building and filing code on the 62 demo mails offline |
| The 8 sample people, their contacts, chat histories and the demo inbox | **Simulated.** All fictional; no real phone numbers |
| The big action button on each card (Send, Let Artha call, Pay, Remind me, Add) | **Simulated.** It records the action inside the app and Artha learns from it (`POST /api/act`); nothing leaves the app |
| The link chips on each card (Send on WhatsApp, SMS, Add to Google Calendar, Pay in your UPI app) | **Real deep links.** They open the app on your phone with the text, time or amount filled in. The user still presses send or pay there. Sample contacts have no numbers, so WhatsApp opens with the text ready and you choose the chat (set `DEMO_PHONE` to send every link to one number) |
| "Equal calls" (memories marked "from a call") | **Simulated.** Stand-in call histories; Artha does not place real phone calls |
| Contacts | **Sample** lists per person; no phone contact import yet |
| Install as an app (PWA) | **Real** on the live HTTPS URL; browsers may not offer install on plain localhost |
| Not finished | Sending directly through WhatsApp Business / SMS APIs; real calls through Equal; importing phone contacts; Google OAuth verification for public sign-up; same-name picks for Gmail-built users vary a little between builds (it may ask instead of picking; it should never pick the wrong person) |

## 8. Testing through the API (no browser)

The UI uses these same routes.

```bash
# A typed note → full result as JSON (who, actions, question if any, reply)
curl -s localhost:8787/api/understand -H 'content-type: application/json' \
  -d '{"p":"rohan","transcript":"Ayush ko bol kal baat karte hain"}'
#   result.clarify.question  → "Kis Ayush ko bolun…"; result.clarify.options → Ayush Sharma / Ayush Gupta
#   result.actions[]         → type, contact_name, when_label, amount_inr, text, language
#   result.blocked           → set when an OTP was caught

# A spoken note (any audio file) → streamed events, one JSON object per line
curl -sN -X POST 'localhost:8787/api/note?p=aditya' -H 'content-type: audio/mpeg' \
  --data-binary @docs/artha-story/clips/a2.mp3
#   {"t":"heard","text":"मेहता जी वाला अपॉइंटमेंट परसों शाम को शिफ्ट करवा दो।",...}
#   ... {"t":"result","result":{"actions":[{"type":"call","contact_name":"Dr. Mehta's Clinic","when_label":"Tue, 24 Nov, 6:00 pm",...}]}}

# The same with text instead of audio
curl -sN localhost:8787/api/note -H 'content-type: application/json' \
  -d '{"p":"aditya","transcript":"Shankar bhaiya ko dhai sau bhej do"}'

# A khata photo (base64 data URL, JPEG/PNG/WebP under 6 MB)
python3 -c "import base64,json;print(json.dumps({'p':'imran','image':'data:image/jpeg;base64,'+base64.b64encode(open('eval/images/khata-imran.jpg','rb').read()).decode()}))" > /tmp/scan.json
curl -s localhost:8787/api/scan -H 'content-type: application/json' -d @/tmp/scan.json

# Reset a person after testing
curl -s -X POST localhost:8787/api/reset -H 'content-type: application/json' -d '{"p":"rohan"}'
```

16 spoken clips in 4 languages are in `docs/artha-story/clips/` (`a*` Aditya, `s*` Sunita, `i*` Imran, `m*` Meenakshi). Each benchmark case and its expected result is in `eval/cases.json`.

All routes are listed in the README under "API".

## 9. How it works (short)

Hear (`gpt-transcribe` + name hints) → Guard (OTPs blocked in code) → Normalize (parso, shaam, dhai hazaar) → Candidates (names by sound) → Recall (`text-embedding-3-large`, 256-dim int8 vectors in a SQLite file per person) → Plan (`gpt-6-luna`, strict JSON, streamed) → Rules (tie means ask) → Action cards → Speak (`gpt-4o-mini-tts`) → Remember.

Benchmark (41 notes, 8 people, 9 languages): Artha completes **97.6%** of tasks fully right, against 19.5% for the base model on the same transcript. Action precision is 100% and recall 97.4%. The median live response is 3.65 s end to end.

## 10. Repo map

```text
server/          API: handler.ts (routes), openai.ts (models), pipeline/ (normalize, candidates, rules, understand, scan),
                 context/ (SQLite memory + embeddings), connectors/gmail.ts
web/             React + three.js + GSAP app (PWA)
data/personas/   the 8 sample people     data/mock-mail/   the demo inboxes (fictional)
eval/            benchmark cases, results, clips list, khata photo
scripts/         demo-user.ts, eval.ts, live and persona tests, build
tests/           unit tests (npm test)
render.yaml, firebase.json  hosting (API on Render, website on Firebase); infra/ is the earlier AWS setup. Not needed locally
```

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `No such built-in module: node:sqlite` | Node is older than 24. Install Node 24+ (section 1) |
| Blank page or no animation in a headless browser | Use the `?p=<id>` links; the app works without WebGL (animations are skipped) |
| Page says `Run "npm run build" first` | run `npm run build`, then `npm start` |
| `401` / model errors in the server log | `OPENAI_API_KEY` missing or without access to the four models |
| Port 8787 busy | `PORT=8790 npm start` |
| First note takes longer | the first call warms up; later notes take 3–5 s |
| A person has odd leftover state | `POST /api/reset {"p":"<id>"}` or Knows → Start over |
| No sound | click once on the page first (browser autoplay rule); the text reply is always shown |
| Google sign-in fails locally | expected without Google keys; use `npm run demo-user` (Journey 6) |

All people, phone numbers, mails and amounts in this project are fictional.
