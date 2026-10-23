import type { LocalMatch, PageSnapshot, SearchResult, Span } from '../core/types';
import { ChromeModel, expansionPrompt, modelError, type ModelSession } from './model';
import { keywordsPrompt, keywordsSchema, parseKeywords, parseVerdict, splitUnit, unit,
  verdictPrompt, verdictSchema, type SearchUnit } from './contract';
import { retrieve } from './retrieval';

async function run(base: ModelSession, prompt: string, schema: object, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const usage = await base.measureContextUsage(prompt, { responseConstraint: schema });
  signal.throwIfAborted();
  if (usage + base.contextUsage >= base.contextWindow) throw new DOMException('Input exceeds model context', 'QuotaExceededError');
  const session = await base.clone({ signal });
  try {
    let overflow = false;
    session.addEventListener?.('contextoverflow', () => { overflow = true; });
    const raw = await session.prompt(prompt, { responseConstraint: schema, omitResponseConstraintInput: true, signal });
    signal.throwIfAborted();
    if (overflow) throw new DOMException('Model discarded context', 'QuotaExceededError');
    return raw;
  } finally { session.destroy(); }
}

async function relevant(base: ModelSession, query: string, source: SearchUnit, signal: AbortSignal): Promise<Span | null> {
  try { return parseVerdict(await run(base, verdictPrompt(query, source), verdictSchema(source), signal), source); }
  catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      for (const part of splitUnit(source)) {
        const found = await relevant(base, query, part, signal);
        if (found) return found;
      }
      return null;
    }
    throw error;
  }
}

async function expand(model: ChromeModel, page: PageSnapshot, query: string, signal: AbortSignal, ready: () => void) {
  const session = await model.create(signal, undefined, expansionPrompt);
  try { ready(); return parseKeywords(await run(session, keywordsPrompt(query, page), keywordsSchema, signal)); }
  catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error('This query exceeds the local model’s context. Shorten it or use TypeSafe.');
    }
    throw error;
  } finally { session.destroy(); }
}

export async function searchLocal(model: ChromeModel, page: PageSnapshot, query: string,
  signal: AbortSignal, progress: (count: number, message?: string) => void): Promise<Extract<SearchResult, { provider: 'chrome-local' }>> {
  const started = performance.now();
  signal.throwIfAborted();
  progress(0, 'Starting the local model…');
  const status = await model.status();
  signal.throwIfAborted();
  if (status.state !== 'available') throw new Error(`${status.message} Open Settings to prepare local search.`);
  const matches = new Map<string, LocalMatch>();
  try {
    const keywords = await expand(model, page, query, signal, () => progress(0, 'Interpreting your search…'));
    signal.throwIfAborted();
    const candidates = retrieve(page.passages, query, keywords);
    if (candidates.length) {
      progress(0, `Preparing to check ${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'}…`);
      const base = await model.create(signal);
      try {
        for (const [index, passage] of candidates.entries()) {
          signal.throwIfAborted();
          progress(index, `Checking candidate ${index + 1} of ${candidates.length}…`);
          const focus = await relevant(base, query, unit(passage), signal);
          if (focus) matches.set(passage.id, { ...passage, local: true, focus });
          progress(index + 1, `Checked ${index + 1} of ${candidates.length} candidates.`);
        }
      } finally { base.destroy(); }
    }
    signal.throwIfAborted();
    return { provider: 'chrome-local', page, query, model: 'Gemini Nano (Chrome local)',
      elapsedMs: Math.round(performance.now() - started),
      matches: page.passages.flatMap(({ id }) => matches.has(id) ? [matches.get(id)!] : []),
    };
  } catch (error) { throw modelError(error); }
}
