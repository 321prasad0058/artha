// Fills a DEMO Gmail mailbox with the fictional inbox in data/mock-mail/<persona>.ts.
// Nothing is sent: each mail is inserted straight into the mailbox (Gmail API messages.insert), from reserved
// `.example` senders, so no real person or company is involved. Run it once, signed in as the demo account.
//   npx tsx scripts/seed-gmail.ts [aarav|rohan] [--replace]   (--replace moves earlier mock mails to Trash first)
import http from 'node:http';
import { execFile } from 'node:child_process';
import { insertMock, profile } from '../server/connectors/gmail.ts';
import { ROHAN_INBOX } from '../data/mock-mail/rohan.ts';
import { AARAV_INBOX } from '../data/mock-mail/aarav.ts';
process.loadEnvFile('.env');

const INBOXES: Record<string, typeof ROHAN_INBOX> = { rohan: ROHAN_INBOX, aarav: AARAV_INBOX };
const who = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'aarav';
const replace = process.argv.includes('--replace');
const inbox = INBOXES[who];
if (!inbox) throw new Error(`No mock inbox for ${who}`);
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first');

// one-time sign-in in the browser (loopback redirect), with permission to insert and read
const REDIRECT = 'http://127.0.0.1:53682/';
const scope = ['https://www.googleapis.com/auth/gmail.insert', 'https://www.googleapis.com/auth/gmail.readonly', ...(replace ? ['https://www.googleapis.com/auth/gmail.modify'] : [])].join(' ');
const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope, prompt: 'consent', access_type: 'online' })}`;
const code: string = await new Promise((resolve, reject) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', REDIRECT);
    const c = u.searchParams.get('code');
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(c ? '<h2>Signed in. You can close this tab and go back to the terminal.</h2>' : '<h2>Sign-in was cancelled.</h2>');
    srv.close(); c ? resolve(c) : reject(new Error(u.searchParams.get('error') ?? 'cancelled'));
  }).listen(53682, '127.0.0.1');
  console.log(`\nSign in as the DEMO Gmail account (not your own) in the browser window that opens.\nIf it does not open, visit:\n${url}\n`);
  // incognito, so the sign-in never picks up your own logged-in Google account
  execFile('open', ['-na', 'Google Chrome', '--args', '--incognito', url]);
});
const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
const tok: any = await tr.json();
if (!tr.ok) throw new Error(tok.error_description ?? tok.error);
const me = await profile(tok.access_token);
console.log(`Signed in as ${me.emailAddress} (${me.messagesTotal} messages already there).`);
if (!/demo|test|artha/i.test(me.emailAddress)) console.log('⚠ This does not look like a demo account. The mails are fictional, but use a separate demo Gmail if you can.');
if (replace) {
  // only mails this script inserted earlier carry the @artha-mock.example Message-ID; nothing else is touched
  const H = { Authorization: `Bearer ${tok.access_token}` };
  const list: any = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=newer_than:120d', { headers: H })).json();
  let trashed = 0;
  for (const m of list.messages ?? []) {
    const meta: any = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Message-ID`, { headers: H })).json();
    const mid = (meta.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === 'message-id')?.value ?? '';
    if (/@artha-mock\.example>?$/.test(mid)) { await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}/trash`, { method: 'POST', headers: H }); trashed++; }
  }
  console.log(`Moved ${trashed} earlier mock mails to Trash.`);
}
let n = 0;
for (const m of inbox) { await insertMock(tok.access_token, me.emailAddress, m); n++; process.stdout.write(`\r  inserted ${n}/${inbox.length}`); }
console.log(`\nDone: ${n} fictional mails are in ${me.emailAddress}. Nothing was sent to anyone.`);
