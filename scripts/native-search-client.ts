import { ChromeModel } from '../src/local/model';
import { searchLocal } from '../src/local/search';
import type { PageSnapshot } from '../src/core/types';

const { snapshot, queries }: { snapshot: PageSnapshot; queries: string[] } = await (await fetch('/config')).json();
const status = document.querySelector<HTMLElement>('[role=status]')!;
const output = document.querySelector('pre')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const model = new ChromeModel();
const availability = await model.status();
status.textContent = availability.message;
run.disabled = availability.state !== 'available';
let controller: AbortController | undefined;
document.querySelector('#stop')!.addEventListener('click', () => controller?.abort());
run.addEventListener('click', async () => {
  run.disabled = true;
  controller = new AbortController();
  const signal = controller.signal;
  const report: { browser: string; source: string; passages: number; results: unknown[]; error?: string } = {
    browser: navigator.userAgent, source: snapshot.url, passages: snapshot.passages.length, results: [],
  };
  try {
    for (const query of queries) {
      const phases: { ms: number; completed: number; message?: string }[] = [];
      const started = performance.now();
      const result = await searchLocal(model, snapshot, query, signal, (completed, message) => {
        status.textContent = message ?? `${completed} checked`;
        phases.push({ ms: Math.round(performance.now() - started), completed, message });
      });
      report.results.push({ query, elapsedMs: result.elapsedMs, phases,
        matches: result.matches.map(({ id, text, focus, pageNumber }) => ({ id, text, focus, pageNumber })) });
      output.textContent = JSON.stringify(report, null, 2);
    }
    status.textContent = 'Native evaluation complete. Review relevance in the results below.';
  } catch (error) {
    report.error = signal.aborted ? 'Cancelled' : String(error);
    status.textContent = report.error;
  } finally {
    output.textContent = JSON.stringify(report, null, 2);
    try {
      const saved = await fetch('/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report, null, 2) });
      if (!saved.ok) throw new Error(`Save failed (${saved.status})`);
    } catch { status.textContent = 'Could not save the report; copy the visible results.'; }
    run.disabled = false;
  }
});
