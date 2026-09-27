import assert from 'node:assert/strict';
import { searchPage } from '../src/core/typesafe';
import { DEFAULT_THRESHOLD, type PageSnapshot } from '../src/core/types';
import { toMarkdown } from '../src/core/markdown';

const apiKey = process.env.TYPESAFE_API_KEY?.trim();
assert.ok(apiKey, 'Set TYPESAFE_API_KEY in .env before running this test.');
const page: PageSnapshot = {
  id: 'live-contract-test', title: 'Travel policy test', url: 'https://example.com/policy',
  passages: [
    { id: 'p0', heading: 'Cancellation', text: 'You can cancel a booking up to 48 hours before departure for a full refund. Later cancellations incur a 25 euro fee.' },
    { id: 'p1', heading: 'Luggage', text: 'Passengers may bring two bags onboard. Bicycles require a separate reservation.' },
    { id: 'p2', heading: 'Refunds', text: 'Refunds for cancelled trips are sent to your original payment method within five working days.' },
    { id: 'p3', heading: 'Catering', text: 'The dining car serves breakfast from seven until ten. Vegetarian meals are available.' },
  ],
};
const result = await searchPage(page, 'What happens if I cancel my trip?', { apiKey, threshold: DEFAULT_THRESHOLD },
  new AbortController().signal, () => {});
const ids = new Set(result.matches.map((match) => match.id));
assert.ok(ids.has('p0') && ids.has('p2'), 'Cancellation and refund passages must match.');
assert.ok(!ids.has('p1') && !ids.has('p3'), 'Unrelated luggage and food passages must not match.');
assert.ok(result.matches.every((match) => match.text.slice(match.focus.start, match.focus.end) === match.focus.text));
assert.ok(toMarkdown(result).includes('original payment method'));
console.log(JSON.stringify({ passed: true, model: result.model, matches: result.matches.map(({ id, probability }) => ({ id, probability })), elapsedMs: result.elapsedMs }));
