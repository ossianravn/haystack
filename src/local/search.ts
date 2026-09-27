import type { LocalMatch, PageSnapshot, SearchResult } from '../core/types';
import { ChromeModel, modelError, type ModelSession } from './model';
import { parseMatches, promptFor, schemaFor, splitUnit, unit, type SearchUnit } from './contract';

export async function searchLocal(model: ChromeModel, page: PageSnapshot, query: string,
  signal: AbortSignal, progress: (count: number) => void): Promise<Extract<SearchResult, { provider: 'chrome-local' }>> {
  const started = performance.now();
  signal.throwIfAborted();
  const status = await model.status();
  signal.throwIfAborted();
  if (status.state !== 'available') throw new Error(`${status.message} Open Settings to prepare local search.`);
  const base = await model.create(signal);
  const matches = new Map<string, LocalMatch>();
  let complete = 0;
  async function fits(units: SearchUnit[]) {
    signal.throwIfAborted();
    const input = await base.measureContextUsage(promptFor(query, units), { responseConstraint: schemaFor(units) });
    const response = JSON.stringify(Object.fromEntries(units.map(({ id, parts }) => [id,
      String(parts.length - 1).length > 2 ? parts.length - 1 : -1,
    ])));
    const output = await base.measureContextUsage(response);
    signal.throwIfAborted();
    return base.contextUsage + input + output <= base.contextWindow;
  }
  async function evaluateSmaller(units: SearchUnit[]) {
    if (units.length > 1) {
      const middle = Math.ceil(units.length / 2);
      await evaluate(units.slice(0, middle));
      await evaluate(units.slice(middle));
    } else for (const part of splitUnit(units[0])) await evaluate([part]);
  }
  async function evaluate(units: SearchUnit[]): Promise<void> {
    signal.throwIfAborted();
    if (!(await fits(units))) {
      await evaluateSmaller(units);
      return;
    }
    let session: ModelSession | undefined;
    try {
      session = await base.clone({ signal });
      signal.throwIfAborted();
      const raw = await session.prompt(promptFor(query, units), { responseConstraint: schemaFor(units), signal });
      signal.throwIfAborted();
      for (const match of parseMatches(raw, units)) if (!matches.has(match.id)) matches.set(match.id, match);
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        // Actual model capacity is authoritative if measurement underestimated the request.
        session?.destroy(); session = undefined;
        await evaluateSmaller(units);
      } else throw error;
    } finally { session?.destroy(); }
  }
  try {
    let batch: SearchUnit[] = [];
    for (const passage of page.passages) {
      signal.throwIfAborted();
      const next = unit(passage);
      if (batch.length && !(await fits([...batch, next]))) {
        await evaluate(batch);
        complete += batch.length;
        progress(complete);
        batch = [];
      }
      batch.push(next);
    }
    if (batch.length) { await evaluate(batch); progress(page.passages.length); }
    signal.throwIfAborted();
    return { provider: 'chrome-local', page, query, model: 'Gemini Nano (Chrome local)',
      elapsedMs: Math.round(performance.now() - started),
      matches: page.passages.flatMap(({ id }) => matches.has(id) ? [matches.get(id)!] : []),
    };
  } catch (error) { throw modelError(error); }
  finally { base.destroy(); }
}
