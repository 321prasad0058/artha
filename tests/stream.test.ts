// The streaming field watcher must report each top-level field exactly once, whole, however the text is chunked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TopFields } from '../server/openai.ts';

const SAMPLE = { language: 'Hinglish', heard_gist: 'Ayush ko "match" batao, 7 baje', heard_points: [{ kind: 'person', text: 'Ayush' }, { kind: 'when', text: 'kal 7 baje' }],
  mentions: [{ text: 'Ayush', kind: 'person', candidates: [{ id: 'ayush_s', score: 0.9 }] }], clarify_question: '', reply: 'आयुष के लिए मेसेज रेडी है।',
  reply_points: [], actions: [{ type: 'message', amount_inr: 0, predicted: false, text: 'Bhai {kal} [7] baje' }], learn: [] };

test('fields arrive whole, once, in order, at any chunk size', () => {
  const text = JSON.stringify(SAMPLE);
  for (const size of [1, 3, 7, 50, text.length]) {
    const got: [string, unknown][] = [];
    const f = new TopFields((k, v) => got.push([k, v]));
    for (let i = 0; i < text.length; i += size) f.push(text.slice(i, i + size));
    assert.deepEqual(got.map(g => g[0]), Object.keys(SAMPLE), `chunk ${size}`);
    assert.deepEqual(Object.fromEntries(got), SAMPLE, `chunk ${size}`);
  }
});
