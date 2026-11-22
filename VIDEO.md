# Demo video

**File:** [Artha-AI-Demo-Video.mp4](Artha-AI-Demo-Video.mp4) · 3 min 25 s · 1080p · English narration, with English captions in `Artha-AI-Demo-Video.srt`

A story-style walkthrough of the full product, recorded from the real app:

| Time | What you see |
|---|---|
| 0:00 | The problem: "Mehta ji wala appointment parso shaam ko shift karwa do". Which Mehta, which day, call or message? A plain model gets only 19.5% of such notes fully right |
| 0:29 | A new user, Aarav from Pune, signs in with Google (read-only; the OTP mail is never opened). The setup road learns his people (including two different Rohits), plans and bills, then folds into what it learned |
| 1:06 | Same-name conflict: Rohan has two friends called Ayush. "Ayush ko bol, kal baat karte hain" is a true tie, so Artha asks one short question with both names as buttons |
| 1:26 | Usually it doesn't need to ask: "Sunday cricket pakka" points to Ayush Sharma, and six clues (sound, nicknames, topic, last conversation…) decide |
| 1:53 | What runs underneath: browser-installed app → CloudFront → AWS Lambda; gpt-transcribe hears, our code pins dates and amounts, gpt-6-luna plans, gpt-4o-mini-tts speaks |
| 2:16 | Private memory per person: a small database plus 256-number vectors. Rohan's real memory shows the two Ayushes only 0.62 alike in meaning; recall blends meaning, person and recency |
| 2:50 | Results on 41 voice notes in 9 languages, and the close |

Live app: https://djq9jnhg6rg4f.cloudfront.net · Code: https://github.com/321prasad0058/artha
