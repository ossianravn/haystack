import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChromeModel, type ModelFactory, type ModelSession } from '../src/local/model';
import { searchLocal } from '../src/local/search';
import { parseMatches, unit } from '../src/local/contract';
import { toMarkdown } from '../src/core/markdown';
import type { PageSnapshot } from '../src/core/types';

function fakeModel(capacity = 1300) {
  const calls: string[] = [];
  let created = 0;
  let destroyed = 0;
  let cloned = 0;
  const session = (): ModelSession => ({
    contextWindow: capacity, contextUsage: 100,
    measureContextUsage: async (text, options) => text.length + JSON.stringify(options?.responseConstraint ?? {}).length,
    clone: async () => { cloned++; return session(); },
    destroy: () => { destroyed++; },
    prompt: async (input, { signal }) => {
      signal.throwIfAborted();
      calls.push(input);
      const data = JSON.parse(input) as { passages: { id: string; sentences: { index: number; text: string }[] }[] };
      return JSON.stringify(Object.fromEntries(data.passages.map((p) => [p.id,
        p.sentences.find((s) => /refund|offside/i.test(s.text))?.index ?? -1,
      ])));
    },
  });
  const factory: ModelFactory = { availability: async () => 'available', create: async () => { created++; return session(); } };
  return { model: new ChromeModel(() => factory), calls, stats: () => ({ created, destroyed, cloned }) };
}

test('local batches preserve source sentences, all passages, PDF links, and honest export metadata', async () => {
  const page: PageSnapshot = { id: 'pdf', title: 'Terms', url: 'https://example.com/terms.pdf', pdf: { pageCount: 20, emptyPages: [] },
    passages: Array.from({ length: 19 }, (_, index) => ({ id: `p${index}`, heading: 'Terms', pageNumber: index + 1,
      text: index === 1 ? 'A dining car serves breakfast.' : 'Tickets are available. Refunds arrive within five days.' })),
  };
  const fake = fakeModel();
  const progress: number[] = [];
  const result = await searchLocal(fake.model, page, 'Cancellation', new AbortController().signal, (count) => progress.push(count));
  assert.equal(result.matches.length, 18);
  assert.equal(result.matches.at(-1)?.id, 'p18');
  assert.equal(progress.at(-1), 19);
  const evaluated = fake.calls.flatMap((raw) => JSON.parse(raw).passages.map((p: { id: string }) => p.id));
  assert.deepEqual(evaluated, page.passages.map((p) => p.id));
  for (const match of result.matches) assert.equal(match.text.slice(match.focus.start, match.focus.end), match.focus.text);
  const markdown = toMarkdown(result);
  assert.ok(markdown.includes('Gemini Nano (Chrome local)') && markdown.includes('#page=19'));
  assert.ok(!markdown.includes('threshold') && !markdown.includes('% relevance'));
  assert.deepEqual(fake.stats(), { created: 1, cloned: fake.calls.length, destroyed: fake.calls.length + 1 });
});

test('oversized local input is split without dropping late text or changing its original sentence span', async () => {
  const text = `${'背景🚂 '.repeat(400)}offside`;
  const page: PageSnapshot = { id: 'long', title: '', url: 'https://example.com', passages: [{ id: 'p0', heading: '', text }] };
  const fake = fakeModel(800);
  const result = await searchLocal(fake.model, page, 'offside', new AbortController().signal, () => {});
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].text, text);
  assert.equal(result.matches[0].focus.text, text);
  const evaluated = fake.calls.flatMap((raw) => JSON.parse(raw).passages.flatMap((p: { sentences: { text: string }[] }) => p.sentences.map((s) => s.text))).join('');
  assert.equal(evaluated, text);
});

test('local cancellation stops later batches and releases the base and active clone', async () => {
  const fake = fakeModel();
  const controller = new AbortController();
  const page: PageSnapshot = { id: 'cancel', title: '', url: 'https://example.com',
    passages: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, heading: '', text: 'Refunds are available.' })),
  };
  await assert.rejects(searchLocal(fake.model, page, 'refund', controller.signal, () => controller.abort()), { name: 'AbortError' });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.stats().destroyed, 2);
});

test('local decisions must cover the supplied IDs and refer to actual original sentences', () => {
  const units = [unit({ id: 'p0', heading: '', text: 'First sentence. Second sentence.' })];
  for (const raw of ['not JSON', '{}', '{"invented":0}', '{"p0":2}', '{"p0":0.5}', '{"p0":null}']) {
    assert.throws(() => parseMatches(raw, units), /local model/);
  }
  assert.deepEqual(parseMatches('{"p0":-1}', units), []);
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
