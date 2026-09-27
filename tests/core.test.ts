import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sentences, passages } from '../src/core/text';
import { makePayload, parseAnswers, searchPage } from '../src/core/typesafe';
import { toMarkdown, markdownFilename } from '../src/core/markdown';
import type { PageSnapshot } from '../src/core/types';

test('split long multilingual content without loss or invalid source offsets', () => {
  const text = `  ${'Price: €20. Next stop: København. 車票。 🚂 '.repeat(200)}  `;
  const chunks = passages(text);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((span) => span.text).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  for (const span of chunks) {
    assert.equal(text.slice(span.start, span.end), span.text);
    assert.ok(span.text.length <= 1800);
    for (const sentence of sentences(span.text)) assert.equal(span.text.slice(sentence.start, sentence.end), sentence.text);
  }
});

test('direct TypeSafe contract, complete batches and lossless Markdown exports', async () => {
  const page: PageSnapshot = { id: 'test', title: 'A *title*', url: 'https://example.com/test?q=(x)',
    passages: Array.from({ length: 19 }, (_, i) => ({ id: `p${i}`, heading: 'Costs', text: `Passage ${i}: <script> **verbatim**. Costs are €${i}.` })) };
  const payload = makePayload('Costs', page.passages.slice(0, 1));
  assert.equal(payload.questions.p0.type, 'noul');
  assert.ok(payload.questions.p0.instructions.includes('passages[0].text'));
  let calls = 0;
  const progress: number[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key');
    const body = JSON.parse(String(init?.body));
    const answers = Object.fromEntries(body.state.passages.flatMap((p: { id: string }) => [
      [p.id, { type: 'noul', noul: p.id === 'p1' ? .2 : .9 }], [`focus_${p.id}`, { choice: 's1' }],
    ]));
    calls++;
    return Response.json({ model: 'jev-test', answers });
  };
  const result = await searchPage(page, 'Costs', { apiKey: 'test-key', threshold: .58 }, new AbortController().signal, (n) => progress.push(n), fetcher);
  assert.equal(calls, 3);
  assert.deepEqual(progress, [8, 16, 19]);
  assert.equal(result.matches.length, 18);
  result.matches.reverse();
  const markdown = toMarkdown(result);
  assert.equal((markdown.match(/^## /gm) || []).length, 18);
  assert.ok(markdown.includes('Passage 18'));
  assert.ok(markdown.indexOf('Passage 0') < markdown.indexOf('Passage 18'));
  assert.ok(markdown.includes('\\<script\\> \\*\\*verbatim\\*\\*'));
  assert.ok(markdown.includes('Source: <https://example.com/test?q=(x)>'));
  assert.equal(markdownFilename('A/B: "x"?'), 'haystack-A-B- -x--.md');
});

test('reject missing and invalid model judgments instead of inventing matches', () => {
  const blocks = [{ id: 'p0', heading: '', text: 'One sentence. Another sentence.' }];
  for (const answers of [{}, { p0: { noul: 2 } }, { p0: { noul: .9 }, focus_p0: { choice: 's99' } }]) {
    assert.throws(() => parseAnswers({ answers }, blocks), /incomplete/);
  }
});

test('cancel between batches without sending remaining page content', async () => {
  const controller = new AbortController();
  const page: PageSnapshot = { id: 'test', title: '', url: 'https://example.com',
    passages: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, heading: '', text: 'Sample text.' })) };
  let calls = 0;
  const fetcher: typeof fetch = async (_, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    return Response.json({ answers: Object.fromEntries(payload.state.passages.map((p: { id: string }) => [p.id, { noul: .9 }])) });
  };
  await assert.rejects(searchPage(page, 'sample', { apiKey: 'test', threshold: .58 }, controller.signal, () => controller.abort(), fetcher), { name: 'AbortError' });
  assert.equal(calls, 1);
});
