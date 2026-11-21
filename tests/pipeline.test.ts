import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { findCandidates } from '../server/pipeline/candidates.ts';
import { normalise } from '../server/pipeline/normalize.ts';
import { secretCheck } from '../server/pipeline/rules.ts';
import { romanize } from '../server/pipeline/translit.ts';
import type { Persona } from '../server/types.ts';

// Fixed "now": Saturday 21 Nov 2026, 2:00 PM IST
const NOW = new Date('2026-11-21T14:00:00+05:30');
const P = (id: string) => JSON.parse(fs.readFileSync(`data/personas/${id}.json`, 'utf8')) as Persona;
const ent = (s: string) => normalise(s, NOW).entities.map(e => e.label);

test('romanises Devanagari, Telugu and Tamil', () => {
  assert.equal(romanize('परसों शाम'), 'parson shaam');
  assert.equal(romanize('मेहता जी'), 'mehtaa jee');
  assert.match(romanize('అమ్మకి చెప్పు'), /^ammaki cheppu$/);
  assert.match(romanize('செல்வி'), /^selvi$/);
});

test('Indian amounts', () => {
  assert.deepEqual(ent('shankar bhaiya ko dhai sau bhej do'), ['₹250']);
  assert.deepEqual(ent('sava lakh de do'), ['₹1,25,000']);
  assert.deepEqual(ent('khate mein dedh hazaar likh do'), ['₹1,500']);
  assert.deepEqual(ent('adichshe rupaye de'), ['₹250']);
  assert.deepEqual(ent('rendu veyyi ivvu'), ['₹2,000']);
  assert.deepEqual(ent('bol do sab theek hai'), []); // "do" is not a number here
});

test('Indian days and times', () => {
  const n = normalise('mehta ji wala appointment parso shaam ko shift karwa do', NOW);
  assert.equal(n.when?.iso, '2026-11-23T18:00:00+05:30');
  assert.equal(normalise('kal ki meeting 4 baje', NOW).when?.iso, '2026-11-22T16:00:00+05:30');
  assert.equal(normalise('repu madhyanam lunch ki vastanu', NOW).when?.iso, '2026-11-22T13:00:00+05:30');
  assert.equal(normalise('udya sakali 11 vajta', NOW).when?.iso, '2026-11-22T11:00:00+05:30');
  assert.equal(normalise('naalai kaalai aaru manikku', NOW).when?.iso, '2026-11-22T06:00:00+05:30');
  assert.equal(normalise('dinner saadhe aath baje', NOW).when?.iso, '2026-11-21T20:30:00+05:30');
  assert.equal(normalise('kal paune do baje', NOW).when?.iso, '2026-11-22T13:45:00+05:30');
  assert.equal(normalise('monday ko call karna', NOW).when?.iso.slice(0, 10), '2026-11-23');
});

test('who: names, nicknames, case endings, look-alikes', () => {
  const a = P('aditya');
  assert.equal(findCandidates('anna ko bol do parcel security pe chhod de', a)[0].id, 'santosh');
  assert.equal(findCandidates('mehtaa jee vaalaa appointment', a)[0].id, 'mehta');
  assert.equal(findCandidates('ammaki cheppu repu vastanu', a)[0].id, 'amma');
  const rahul = findCandidates('rahul ko bol do kal ki meeting', a).map(c => c.id);
  assert.ok(rahul.includes('rahul_v') && rahul.includes('rahul_k'));
  const tai = findCandidates('tai la sang udya yeu naka', P('sunita')).map(c => c.id);
  assert.ok(tai.includes('mangal') && tai.includes('vaishali'));
  assert.equal(findCandidates('selvikku sollu naalaikku vara vendaam', P('meenakshi'))[0].id, 'selvi');
});

test('secrets are blocked before any model', () => {
  assert.equal(secretCheck('HDFC wale ko OTP bata do 4 8 2 9 1 3', '').blocked, true);
  assert.equal(secretCheck('एचडीएफसी वाले को ओटीपी बता दो 482913', romanize('एचडीएफसी वाले को ओटीपी बता दो 482913')).blocked, true);
  assert.equal(secretCheck('my pin code is 500081, send the parcel', '').blocked, false);
  assert.equal(secretCheck('OTP aaya tha kya?', '').blocked, false); // no digits: just asking
});
