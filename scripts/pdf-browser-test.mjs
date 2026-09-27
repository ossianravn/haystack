import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pdfFixture } from '../tests/pdf-fixture.mjs';

const live = process.argv.includes('--live');
if (live) assert.ok(process.env.TYPESAFE_API_KEY, 'Provide .env for the live DBU test.');
let holdFetch = false;
let fetchStarted;
const waitingFetch = new Promise((resolve) => { fetchStarted = resolve; });
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/pdf');
  if (holdFetch) { fetchStarted(() => response.end(pdfFixture())); return; }
  response.end(pdfFixture(request.url === '/blank.pdf'));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = live ? 'https://www.dbu.dk/media/kc1offln/lovbogen-2025-2026.pdf' : `${origin}/rules.pdf`;
const directory = path.resolve('dist/chrome');
await mkdir('test-results', { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, executablePath: process.env.HAYSTACK_CHROMIUM || undefined,
  args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`, '--enable-unsafe-extension-debugging', '--remote-debugging-port=9337'],
  ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 400, height: 860 }, acceptDownloads: true,
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async (key) => { await chrome.storage.local.set({ apiKey: key, threshold: .58 }); }, live ? process.env.TYPESAFE_API_KEY : 'test-key');
  const id = new URL(worker.url()).host;
  const source = await context.newPage();
  await source.goto(url, { waitUntil: 'load' });
  const panel = await context.newPage();
  const errors = [];
  panel.on('pageerror', (error) => errors.push(error.message));
  panel.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = [];
  if (!live) await context.route('https://api.typesafe.ai/v1/systemone', async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    const answers = Object.fromEntries(Object.entries(payload.questions).map(([key, question]) => [key,
      question.type === 'choice' ? { choice: Object.keys(question.criteria)[0] } : { noul: .95 }]));
    await route.fulfill({ json: { model: 'pdf-browser-test', answers } });
  });
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.getByLabel('What are you looking for?').fill('offside');
  await source.bringToFront();
  const extensionCDP = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await extensionCDP.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const targetInfo = targetInfos.find((target) => target.url === url);
  assert.ok(targetInfo, 'Find the PDF tab target.');
  // Exercise the actual release manifest's activeTab grant, without adding host access.
  await extensionCDP.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
  await panel.waitForFunction(() => document.querySelector('.export-actions') || document.querySelector('[role="alert"]'), undefined, { timeout: live ? 600000 : 30000 });
  const error = await panel.locator('[role="alert"]').allTextContents();
  assert.deepEqual(error, [], error.join('\n'));
  const count = await panel.locator('.result-row').count();
  assert.ok(live ? count > 0 : count === 2);
  assert.ok((await panel.locator('.source-line').innerText()).includes(live ? '148 PDF pages' : '3 PDF pages'));
  if (!live) await panel.getByText('1 PDF page has no extractable text.', { exact: false }).waitFor();
  const second = panel.locator('.passage-button').nth(1);
  const pageNumber = Number((await second.getAttribute('aria-label')).match(/PDF page (\d+)/)[1]);
  await panel.evaluate(() => document.querySelectorAll('.passage-button')[1].click());
  await source.waitForURL(`**#page=${pageNumber}`);
  let visiblePage;
  let lastValues;
  for (let attempt = 0; attempt < 100; attempt++) {
    const values = await Promise.all(source.frames().map((frame) => frame.locator('#pageSelector')
      .evaluateAll((inputs) => inputs.map((input) => input.value)).catch(() => [])));
    lastValues = values;
    visiblePage = values.flat().find((value) => value === String(pageNumber));
    if (visiblePage) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(visiblePage, String(pageNumber), `Native viewer page mismatch: ${JSON.stringify({ lastValues, url: source.url(), matches: await panel.locator('.result-row').count() })}`);
  await panel.waitForFunction(() => document.querySelectorAll('.result-row')[1]?.dataset.active === 'true');
  assert.equal(await panel.locator('.result-row').count(), count, 'PDF navigation must retain search results.');
  console.log(`Extracted and searched ${live ? 148 : 3} PDF pages; ${count} matches.`);
  await panel.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
  await panel.screenshot({ path: `artifacts/chrome-pdf${live ? '-live' : ''}.png` });
  await panel.setViewportSize({ width: 320, height: 780 });
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await panel.evaluate(() => {
    const original = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = (options) => original({ ...options, saveAs: false });
  });
  const downloadPromise = panel.waitForEvent('download');
  await panel.evaluate(() => document.querySelectorAll('.export-actions button')[1].click());
  const download = await downloadPromise;
  const output = `test-results/pdf${live ? '-live' : ''}-export.md`;
  await download.saveAs(output);
  const markdown = await readFile(output, 'utf8');
  assert.equal((markdown.match(/^## /gm) || []).length, count);
  assert.ok(markdown.includes(`#page=${pageNumber}`));
  if (live) assert.ok(/offside/i.test(markdown));
  if (!live) {
    assert.equal(requests.flatMap((request) => request.state.passages).length, 2);
    await source.goto(`${origin}/blank.pdf`);
    await extensionCDP.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
    await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
    await panel.getByText('This PDF has no extractable text.', { exact: false }).waitFor();
    assert.equal(requests.length, 1, 'No text means no TypeSafe request.');
    await source.goto(url);
    await extensionCDP.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
    holdFetch = true;
    await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
    const releaseFetch = await waitingFetch;
    await panel.evaluate(() => document.querySelector('[aria-label="Cancel search"]').click());
    releaseFetch();
    await panel.getByText('Search cancelled.', { exact: true }).waitFor();
    assert.equal(requests.length, 1, 'A cancelled PDF download must not send text to TypeSafe.');
    holdFetch = false;
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, browser: 'Chrome', live, matches: count,
    checks: ['release activeTab', 'bundled PDF worker', 'all pages', 'native viewer page', 'retained results', 'Markdown page links', '320px layout', ...(!live ? ['empty PDF', 'cancel PDF fetch'] : [])] }));
  if (process.env.HAYSTACK_INSPECT) {
    console.log('Inspect using agent-browser --cdp 9337; press Enter to finish.');
    await new Promise((resolve) => process.stdin.once('data', resolve));
  }
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
