import { sentences } from '../core/text';
import type { LocalMatch, Passage, Span } from '../core/types';

export interface SearchUnit { id: string; passage: Passage; parts: { text: string; focus: Span }[] }
export function unit(passage: Passage): SearchUnit {
  return { id: passage.id, passage, parts: sentences(passage.text).map((focus) => ({ text: focus.text, focus })) };
}

export function promptFor(query: string, units: SearchUnit[]) {
  return JSON.stringify({ query, passages: units.map(({ id, passage, parts }) => ({
    id, heading: passage.heading, sentences: parts.map(({ text }, index) => ({ index, text })),
  })) });
}

export function schemaFor(units: SearchUnit[]) {
  return { type: 'object', properties: Object.fromEntries(units.map(({ id, parts }) => [id,
    { type: 'integer', enum: [-1, ...parts.map((_, index) => index)] },
  ])), required: units.map(({ id }) => id), additionalProperties: false };
}

export function parseMatches(raw: string, units: SearchUnit[]): LocalMatch[] {
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error('The local model returned unreadable matches. Search again.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== units.length) {
    throw new Error('The local model returned incomplete matches. Search again.');
  }
  const matches: LocalMatch[] = [];
  for (const { id, passage, parts } of units) {
    const index = Object.getOwnPropertyDescriptor(data, id)?.value;
    if (!Number.isInteger(index) || index < -1 || index >= parts.length) {
      throw new Error('The local model returned an invalid sentence reference. Search again.');
    }
    if (index !== -1) matches.push({ ...passage, local: true, focus: parts[index].focus });
  }
  return matches;
}

export function splitUnit(source: SearchUnit): SearchUnit[] {
  if (source.parts.length > 1) {
    const middle = Math.ceil(source.parts.length / 2);
    return [source.parts.slice(0, middle), source.parts.slice(middle)].map((parts) => ({ ...source, parts }));
  }
  const part = source.parts[0];
  const characters = Array.from(part.text);
  if (characters.length < 2) throw new Error('This query and passage exceed the local model’s context. Shorten the query or use TypeSafe.');
  const middle = Math.ceil(characters.length / 2);
  // Keep the original sentence span even if its input needs to be evaluated in pieces.
  return [characters.slice(0, middle), characters.slice(middle)].map((text) => ({
    ...source, parts: [{ text: text.join(''), focus: part.focus }],
  }));
}
