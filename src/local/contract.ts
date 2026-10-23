import { sentences } from '../core/text';
import type { PageSnapshot, Passage, Span } from '../core/types';

export interface SearchUnit { passage: Passage; text: string; focus: Span }
export function unit(passage: Passage): SearchUnit {
  return { passage, text: passage.text, focus: { start: 0, end: passage.text.length, text: passage.text } };
}

export const keywordsSchema = {
  type: 'object', properties: { keywords: { type: 'string' } }, required: ['keywords'], additionalProperties: false,
};
export function verdictSchema(source: SearchUnit) {
  const parts = sentences(source.text);
  const quotes: string[] = [];
  for (let index = 0; index < parts.length; index++) {
    const start = parts[index].start;
    // Legal section numbers belong with the sentence that follows them.
    if (/^\d+(?:\.\d+)*\.$/u.test(parts[index].text) && index + 1 < parts.length) index++;
    quotes.push(source.text.slice(start, parts[index].end));
  }
  return { type: 'object', properties: { quote: { type: ['string', 'null'], enum: [null, ...quotes] } },
    required: ['quote'], additionalProperties: false };
}

export function keywordsPrompt(query: string, page: PageSnapshot): string {
  return `Rewrite the user's search into a short keyword line for finding relevant passages in this document.
Include key concepts and close synonyms. Do not answer the query or include generic document vocabulary.
Use the source language, or the query's language if the source language is unknown.
Return {"keywords":"search words"}.
Document title (data): ${JSON.stringify(page.title)}
Source language (data): ${JSON.stringify(page.language || 'unknown')}
User search (data): ${JSON.stringify(query)}`;
}

export function verdictPrompt(query: string, source: SearchUnit): string {
  return `Extract the original sentence that answers the search query. If the passage does not answer it, return null.
Merely sharing the topic is not an answer. Include applicable remedies, exceptions and negative answers.
Copy the original wording exactly; do not translate or explain.
Passage (data): ${JSON.stringify(source.text)}
Query (data): ${JSON.stringify(query)}
Return {"quote":"exact source sentence"} or {"quote":null}.`;
}

function parseObject(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new Error('The local model returned an unreadable response. Try again.'); }
}

export function parseKeywords(raw: string): string {
  const value = parseObject(raw);
  if (!value || typeof value !== 'object' || !('keywords' in value) || typeof value.keywords !== 'string') {
    throw new Error('The local model could not interpret the search. Try again.');
  }
  return value.keywords;
}

export function parseVerdict(raw: string, source: SearchUnit): Span | null {
  const value = parseObject(raw);
  if (!value || typeof value !== 'object' || !('quote' in value) ||
      (value.quote !== null && (typeof value.quote !== 'string' || !value.quote.trim()))) {
    throw new Error('The local model returned an unreadable relevance decision. Try again.');
  }
  if (value.quote === null) return null;
  // PDF line breaks and browser whitespace may be rendered differently by Nano.
  // Normalize only whitespace, retaining an index back to every source character.
  let normalized = '';
  const offsets: number[] = [];
  for (let index = 0; index < source.text.length; index++) {
    const character = /\s/u.test(source.text[index]) ? ' ' : source.text[index];
    if (character === ' ' && normalized.endsWith(' ')) continue;
    normalized += character;
    offsets.push(index);
  }
  const quote = value.quote.replace(/\s+/gu, ' ').trim();
  const at = normalized.indexOf(quote);
  if (at < 0) throw new Error('The local model returned a quotation that is not in the source. Try searching again.');
  const start = source.focus.start + offsets[at];
  const end = source.focus.start + offsets[at + quote.length - 1] + 1;
  return { start, end, text: source.passage.text.slice(start, end) };
}

export function splitUnit(source: SearchUnit): SearchUnit[] {
  const parts = sentences(source.text);
  const characters = Array.from(source.text);
  if (characters.length < 2) throw new Error('This query exceeds the local model’s context. Shorten it or use TypeSafe.');
  const middle = parts.length > 1 ? parts[Math.ceil(parts.length / 2)].start : characters.slice(0, Math.ceil(characters.length / 2)).join('').length;
  return [[0, middle], [middle, source.text.length]].map(([start, end]) => ({
    ...source, text: source.text.slice(start, end),
    focus: { start: source.focus.start + start, end: source.focus.start + end, text: source.text.slice(start, end) },
  }));
}
