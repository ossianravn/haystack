import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChromeModel, type ModelFactory, type ModelSession } from '../src/local/model';
import { searchLocal } from '../src/local/search';
import { parseKeywords, parseVerdict, unit, verdictSchema } from '../src/local/contract';
import { retrieve } from '../src/local/retrieval';
import { toMarkdown } from '../src/core/markdown';
import type { PageSnapshot } from '../src/core/types';

function fakeModel(capacity = 1600) {
  const calls: string[] = [];
  let created = 0;
  let destroyed = 0;
  let cloned = 0;
  const session = (): ModelSession => ({
    contextWindow: capacity, contextUsage: 100,
    measureContextUsage: async (text, options) => text.length + JSON.stringify(options?.responseConstraint ?? {}).length,
    clone: async () => { cloned++; return session(); },
    destroy: () => { destroyed++; },
    prompt: async (input, { signal, responseConstraint }) => {
      signal.throwIfAborted();
      if (input.startsWith('Rewrite')) return '{"keywords":"refund offside"}';
      const text = JSON.parse(input.split('Passage (data): ')[1].split('\nQuery (data):')[0]) as string;
      calls.push(text);
      const allowed = (responseConstraint as { properties: { quote: { enum: (string | null)[] } } }).properties.quote.enum;
      return JSON.stringify({ quote: allowed.find((quote) => quote && /refund|offside/i.test(quote)) ?? null });
    },
  });
  const factory: ModelFactory = { availability: async () => 'available', create: async () => { created++; return session(); } };
  return { model: new ChromeModel(() => factory), calls, stats: () => ({ created, destroyed, cloned }) };
}

test('local retrieval verifies every candidate, preserves source order, PDF links and original text', async () => {
  const page: PageSnapshot = { id: 'pdf', title: 'Terms', url: 'https://example.com/terms.pdf', pdf: { pageCount: 20, emptyPages: [] },
    passages: Array.from({ length: 19 }, (_, index) => ({ id: `p${index}`, heading: 'Terms', pageNumber: index + 1,
      text: index === 1 ? 'A dining car serves breakfast.' : 'Tickets are available. Refunds arrive within five days.' })),
  };
  const fake = fakeModel();
  const progress: { count: number; message?: string }[] = [];
  const result = await searchLocal(fake.model, page, 'Cancellation', new AbortController().signal,
    (count, message) => progress.push({ count, message }));
  assert.equal(result.matches.length, 18);
  assert.equal(result.matches.at(-1)?.id, 'p18');
  assert.equal(progress[0].message, 'Starting the local model…');
  assert.ok(progress.some(({ message }) => message === 'Interpreting your search…'));
  assert.equal(progress.at(-1)?.count, 18);
  assert.equal(fake.calls.length, 18);
  assert.ok(!fake.calls.includes('A dining car serves breakfast.'));
  for (const match of result.matches) assert.equal(match.text.slice(match.focus.start, match.focus.end), match.focus.text);
  const markdown = toMarkdown(result);
  assert.ok(markdown.includes('Gemini Nano (Chrome local)') && markdown.includes('#page=19'));
  assert.ok(!markdown.includes('threshold') && !markdown.includes('% relevance'));
  assert.deepEqual(fake.stats(), { created: 2, cloned: 19, destroyed: 21 });
});

test('oversized candidates are split without dropping late text or changing original source spans', async () => {
  const text = `${'背景🚂 '.repeat(400)}offside`;
  const page: PageSnapshot = { id: 'long', title: '', url: 'https://example.com', passages: [{ id: 'p0', heading: '', text }] };
  const fake = fakeModel(1300);
  const result = await searchLocal(fake.model, page, 'offside', new AbortController().signal, () => {});
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].text, text);
  assert.ok(result.matches[0].focus.text.endsWith('offside'));
  assert.equal(text.slice(result.matches[0].focus.start, result.matches[0].focus.end), result.matches[0].focus.text);
  assert.equal(fake.calls.join(''), text);
});

test('local cancellation stops later candidates and releases the base and active clone', async () => {
  const fake = fakeModel();
  const controller = new AbortController();
  const page: PageSnapshot = { id: 'cancel', title: '', url: 'https://example.com',
    passages: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, heading: '', text: 'Refunds are available.' })),
  };
  await assert.rejects(searchLocal(fake.model, page, 'refund', controller.signal, (count) => {
    if (count > 0) controller.abort();
  }), { name: 'AbortError' });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.stats().destroyed, 4);
});

test('candidate retrieval retains original Danish concepts, expansions and late matches without a top-N cutoff', () => {
  const passages = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, heading: '', text: 'Maden kan være kold.' }));
  passages.push({ id: 'temperature', heading: '', text: 'Temperaturen kan ændre sig under levering.' });
  passages.push({ id: 'account', heading: '', text: 'Du skal beskytte din adgangskode.' });
  const selected = retrieve(passages, 'Hvad sker der med kold mad?', 'temperatur kølig');
  assert.equal(selected.length, 61);
  assert.ok(selected.some(p => p.id === 'p59') && selected.some(p => p.id === 'temperature'));
  assert.ok(!selected.some(p => p.id === 'account'));
});

test('local quotations are grounded in exact source offsets, including PDF whitespace, and invented quotes fail', () => {
  const source = unit({ id: 'p0', heading: '', text: '🚂 Terms. Refunds\n  are available.' });
  for (const raw of ['null', '{}', '{"quote":true}', '{"quote":"Invented text."}', '{"quote":""}']) {
    assert.throws(() => parseVerdict(raw, source), /local model/);
  }
  assert.equal(parseVerdict('{"quote":null}', source), null);
  const focus = parseVerdict('{"quote":"Refunds are available."}', source)!;
  assert.equal(source.text.slice(focus.start, focus.end), 'Refunds\n  are available.');
  assert.equal(parseKeywords('{"keywords":"temperatur"}'), 'temperatur');
  assert.throws(() => parseKeywords('{"keywords":[]}'), /local model/);
  const legal = verdictSchema(unit({ id: 'legal', heading: '', text: '15.2. Refunds are available.' }));
  assert.deepEqual(legal.properties.quote.enum, [null, '15.2. Refunds are available.']);
});

test('setup creates during the click call, reports progress, probes inference, and destroys its session', async () => {
  let started = false;
  let destroyed = false;
  const messages: string[] = [];
  const factory: ModelFactory = {
    availability: async () => 'downloadable',
    create: (options) => {
      started = true;
      const monitor = new EventTarget();
      options.monitor?.(monitor);
      monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: .5 }));
      return Promise.resolve({ contextUsage: 1, contextWindow: 4000, measureContextUsage: async () => 1,
        prompt: async () => '{"p0":0}', clone: async () => { throw new Error('Not used for setup'); }, destroy: () => { destroyed = true; } });
    },
  };
  const model = new ChromeModel(() => factory);
  const preparing = model.prepare(new AbortController().signal, (message) => messages.push(message));
  assert.equal(started, true);
  await preparing;
  assert.equal(destroyed, true);
  assert.ok(messages.includes('Downloading Gemini Nano… 50%'));
});
