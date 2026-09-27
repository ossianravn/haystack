import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = await readFile('tests/fixture.html');
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(fixture); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const directory = path.resolve('test-results/chrome-extension');
await mkdir('test-results', { recursive: true });
await cp('dist/chrome', directory, { recursive: true });
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
// Only the isolated test copy gets fixture access; release artifacts retain activeTab.
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(path.resolve('.test-profile-chrome'), {
  channel: 'chromium', headless: true,
  executablePath: process.env.HAYSTACK_CHROMIUM || undefined,
  args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  ignoreDefaultArgs: ['--disable-extensions'],
  viewport: { width: 400, height: 860 }, acceptDownloads: true,
});
try {
  console.log('Chromium launched; waiting for the extension.');
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 });
  await worker.evaluate(async () => { await chrome.storage.local.clear(); await chrome.downloads.erase({}); });
  const id = new URL(worker.url()).host;
  const source = await context.newPage();
  await source.goto(origin);
  const panel = await context.newPage();
  let downloaded;
  for (const page of [source, panel]) page.on('download', (download) => { downloaded = download; });
  const errors = [];
  panel.on('pageerror', (error) => errors.push(error.message));
  const requests = [];
  await context.route('https://api.typesafe.ai/v1/systemone', async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    assert.ok(!JSON.stringify(payload).includes('_SECRET'));
    const answers = {};
    for (const [questionId, question] of Object.entries(payload.questions)) {
      if (question.type === 'choice') answers[questionId] = { type: 'choice', choice: Object.keys(question.criteria)[0] };
      else {
        const text = payload.state.passages.find((p) => p.id === questionId)?.text ?? '';
        answers[questionId] = { type: 'noul', noul: /cancel|refund|Haystack finds/i.test(text) ? .95 : .05 };
      }
    }
    await route.fulfill({ json: { model: 'browser-test', answers } });
  });
  await panel.goto(`chrome-extension://${id}/panel.html`);
  console.log('Extension panel loaded.');
  await panel.getByRole('button', { name: 'Choose search engine', exact: true }).click();
  await panel.getByLabel('TypeSafe API key', { exact: true }).fill('test-key-only');
  await panel.getByRole('button', { name: 'Connect & save' }).click();
  await panel.getByText('Connected to TypeSafe. Settings saved.').waitFor();
  console.log('Settings verified.');
  await panel.screenshot({ path: 'artifacts/chrome-settings.png' });
  await panel.getByRole('button', { name: 'Back to search' }).click();
  await panel.getByLabel('What are you looking for?').fill('What happens if I cancel?');
  await source.bringToFront();
  await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
  await panel.getByRole('button', { name: 'Copy all', exact: true }).waitFor();
  console.log('Search returned results.');
  const passages = await panel.locator('.result-row').count();
  assert.ok(passages >= 2);
  assert.equal(await source.evaluate(() => CSS.highlights.get('haystack-passages')?.size), passages);
  assert.ok(await source.evaluate(() => CSS.highlights.get('haystack-active')?.size));
  await panel.screenshot({ path: 'artifacts/chrome-results.png', fullPage: true });
  await panel.setViewportSize({ width: 320, height: 780 });
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await panel.screenshot({ path: 'artifacts/chrome-results-narrow.png' });
  await panel.evaluate(() => document.querySelector('[aria-label="Next match"]').click());
  await panel.waitForFunction(() => document.querySelectorAll('.result-row')[1]?.getAttribute('data-active') === 'true');
  await source.evaluate(() => { document.querySelector('#cancel strong').textContent = 'a changed deadline'; });
  // Select the edited passage itself; other results must remain navigable.
  await panel.evaluate(() => [...document.querySelectorAll('.passage-button')]
    .find((button) => button.textContent.includes('You can cancel a booking')).click());
  await panel.getByText('The page text changed. Search again to refresh the matches.').waitFor();
  assert.equal(await source.evaluate(() => CSS.highlights.has('haystack-passages')), false);
  // Snapshot export remains usable even when the original page has changed.
  await panel.evaluate(() => document.querySelectorAll('.export-actions button')[0].click());
  await panel.getByText(`Copied all ${passages} matches as Markdown.`).waitFor();
  await context.grantPermissions(['clipboard-read'], { origin });
  const clipboard = await source.evaluate(() => navigator.clipboard.readText());
  assert.ok(clipboard.includes('Source: <'));
  assert.equal((clipboard.match(/^## /gm) || []).length, passages);
  // Exercise the download UI while suppressing the OS Save As dialog in the test profile.
  await panel.evaluate(() => {
    const original = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = (options, ...rest) => {
      window.downloadOptions = options;
      return original({ ...options, saveAs: false }, ...rest);
    };
  });
  await panel.evaluate(() => document.querySelectorAll('.export-actions button')[1].click());
  await panel.getByText('Markdown file sent to your browser’s downloads.').waitFor();
  await panel.waitForFunction(async () => (await chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] }))[0]?.state === 'complete');
  assert.ok(await panel.evaluate(() => window.downloadOptions.filename.endsWith('.md') && window.downloadOptions.saveAs));
  assert.ok(downloaded, 'The browser must emit a download event.');
  await downloaded.saveAs('test-results/chrome-export.md');
  assert.equal(await readFile('test-results/chrome-export.md', 'utf8'), clipboard.replaceAll('\r\n', '\n'));
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(requests.length >= 2);
  const capturedTexts = requests.flatMap((request) => request.state.passages.map((passage) => passage.text));
  assert.ok(capturedTexts.includes('Before a line break.') && capturedTexts.includes('After a line break.'));
  await panel.bringToFront();
  await panel.getByText('Page changed. Search this page when you’re ready.').waitFor();
  assert.equal(await panel.locator('.result-row').count(), 0);
  console.log(JSON.stringify({ passed: true, browser: 'Chromium', matches: passages,
    checks: ['settings', 'capture', 'privacy exclusions', 'API contract (mock)', 'highlights', 'navigation', 'stale DOM', 'clipboard', 'download', '320px layout'] }));
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
