import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installLocalModelDouble } from '../tests/local-model-double.mjs';

const live = process.argv.includes('--live');
const inspect = process.argv.includes('--inspect');
const fixture = await readFile('tests/fixture.html');
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(fixture); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const directory = path.resolve('test-results/local-extension');
await mkdir(directory, { recursive: true });
await cp('dist/chrome', directory, { recursive: true });
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest));
let context;
try {
  context = await chromium.launchPersistentContext(live ? path.resolve('.test-profile-local-native') : '', {
    channel: 'chromium', headless: true, executablePath: process.env.HAYSTACK_CHROMIUM || undefined,
    args: ['--enable-unsafe-extension-debugging', ...(inspect ? ['--remote-debugging-port=9463'] : [])],
    ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 400, height: 900 },
  });
  const cdp = await context.browser().newBrowserCDPSession();
  // Also works with installed Chrome, which ignores --load-extension.
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: directory });
  const source = await context.newPage();
  await source.goto(origin);
  const panel = await context.newPage();
  let requests = 0;
  await context.route('https://api.typesafe.ai/**', async (route) => { requests++; await route.abort(); });
  if (!live) await panel.addInitScript(installLocalModelDouble);
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.evaluate(() => chrome.storage.local.clear());
  await panel.reload();
  const native = await panel.evaluate(async () => ({
    exposed: !!window.LanguageModel,
    availability: window.LanguageModel ? await window.LanguageModel.availability() : 'unavailable',
    userAgent: navigator.userAgent,
  }));
  if (live) console.log(JSON.stringify({ actualModel: native }));
  await panel.getByRole('button', { name: 'Choose search engine', exact: true }).click();
  await panel.getByRole('button', { name: 'Chrome local', exact: true }).click();
  await panel.getByText('Experimental', { exact: true }).waitFor();
  await panel.screenshot({ path: `artifacts/local-${live ? 'native' : 'setup'}.png`, fullPage: true });
  if (live && native.availability !== 'available') {
    console.log(JSON.stringify({ inferenceVerified: false, reason: native.availability,
      message: 'Native capability was checked without starting a model download in the isolated test profile.' }));
  } else {
    await panel.evaluate(() => chrome.storage.local.set({ apiKey: 'preserved-test-key', threshold: .77 }));
    await panel.getByRole('button', { name: /^(Set up & use local model|Use local model)$/ }).click();
    await panel.getByText('Chrome local selected. Settings saved.').waitFor({ timeout: 60000 });
    const stored = await panel.evaluate(() => chrome.storage.local.get(['provider', 'apiKey', 'threshold']));
    assert.deepEqual(stored, { provider: 'chrome-local', apiKey: 'preserved-test-key', threshold: .77 });
    await panel.evaluate(() => chrome.storage.local.remove('apiKey'));
    await panel.getByRole('button', { name: 'Back to search' }).click();
    await panel.getByLabel('What are you looking for?').fill('What happens if I cancel?');
    await panel.getByText('Find processes the page or PDF’s text on this device.').waitFor();
    await source.bringToFront();
    await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
    await panel.getByRole('button', { name: 'Copy all', exact: true }).waitFor({ timeout: 60000 });
    const matches = await panel.locator('.result-row').count();
    assert.ok(matches >= 2);
    assert.equal(await panel.getByText('Matched locally', { exact: true }).count(), matches);
    assert.equal(await source.evaluate(() => CSS.highlights.get('haystack-passages')?.size), matches);
    await panel.evaluate(() => document.querySelectorAll('.passage-button')[1].click());
    await source.waitForFunction(() => [...CSS.highlights.get('haystack-active')][0]?.toString().length > 0);
    await panel.screenshot({ path: 'artifacts/local-results.png', fullPage: true });
    await panel.setViewportSize({ width: 320, height: 800 });
    assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await panel.evaluate(() => document.querySelectorAll('.export-actions button')[0].click());
    await panel.getByText(`Copied all ${matches} matches as Markdown.`).waitFor();
    await context.grantPermissions(['clipboard-read'], { origin });
    const copied = await source.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes('Gemini Nano (Chrome local)') && !copied.includes('threshold'));
    let downloaded;
    panel.on('download', (download) => { downloaded = download; });
    source.on('download', (download) => { downloaded = download; });
    await panel.evaluate(() => {
      const original = chrome.downloads.download.bind(chrome.downloads);
      chrome.downloads.download = (options) => original({ ...options, saveAs: false });
      document.querySelectorAll('.export-actions button')[1].click();
    });
    await panel.waitForFunction(async () => (await chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] }))[0]?.state === 'complete');
    assert.ok(downloaded);
    await downloaded.saveAs('test-results/local-export.md');
    assert.equal(await readFile('test-results/local-export.md', 'utf8'), copied.replaceAll('\r\n', '\n'));
    if (!live) {
      assert.equal(await panel.evaluate(() => window.localModelTest.active), 0);
      await panel.evaluate(() => { window.localModelTest.hold = true; document.querySelector('[aria-label="Clear results and highlights"]').click(); });
      await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
      await panel.getByRole('button', { name: 'Cancel search', exact: true }).waitFor();
      await panel.waitForFunction(() => window.localModelTest.active >= 2);
      await panel.evaluate(() => document.querySelector('[aria-label="Cancel search"]').click());
      await panel.getByText('Search cancelled.').waitFor();
      await panel.waitForFunction(() => window.localModelTest.active === 0);
      assert.equal(await panel.locator('.result-row').count(), 0);
      await panel.evaluate(() => chrome.storage.local.set({ provider: 'typesafe' }));
      await panel.getByText('Find sends the page or PDF’s text to TypeSafe.').waitFor();
      await panel.evaluate(() => chrome.storage.local.set({ provider: 'chrome-local' }));
      await panel.getByText('Find processes the page or PDF’s text on this device.').waitFor();
      await panel.evaluate(() => { window.localModelTest.availability = 'unavailable'; });
      await panel.getByRole('button', { name: 'Open settings' }).click();
      await panel.getByText('Chrome’s local model is unavailable in this browser or on this device. You can use TypeSafe instead.').waitFor();
      assert.equal(await panel.getByRole('button', { name: 'Set up & use local model' }).isDisabled(), true);
    }
    assert.equal(requests, 0, 'Local mode must never call TypeSafe');
    console.log(JSON.stringify({ passed: true, model: live ? 'native Gemini Nano' : 'controlled model double', matches,
      checks: ['setup', 'provider persistence', 'no API key', 'source highlights', 'Markdown clipboard/download', '320px layout', 'no cloud calls', 'cancellation/unavailable (mock only)'] }));
  }
  if (inspect) { console.log('Inspection ready on CDP port 9463.'); await new Promise((resolve) => setTimeout(resolve, 30000)); }
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
}
