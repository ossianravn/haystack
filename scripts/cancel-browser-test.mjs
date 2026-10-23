import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installLocalModelDouble } from '../tests/local-model-double.mjs';

const fixture = await readFile('tests/fixture.html');
const server = createServer((_, response) => response.end(fixture));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const directory = path.resolve('test-results/cancel-extension');
await mkdir(directory, { recursive: true });
await cp('dist/chrome', directory, { recursive: true });
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest));
let context;
const inspect = process.argv.includes('--inspect');
try {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, executablePath: process.env.HAYSTACK_CHROMIUM || undefined,
    args: ['--enable-unsafe-extension-debugging', ...(inspect ? ['--remote-debugging-port=9464'] : [])],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 320, height: 800 },
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: directory });
  const source = await context.newPage();
  await source.goto(`http://127.0.0.1:${server.address().port}`);
  const panel = await context.newPage();
  await panel.addInitScript(installLocalModelDouble);
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.evaluate(() => chrome.storage.local.set({ provider: 'chrome-local' }));
  await panel.reload();
  await panel.evaluate(() => { window.localModelTest.availability = 'available'; window.localModelTest.hold = true; });
  // Reload readiness after the controlled model has been made available.
  await panel.getByRole('button', { name: 'Open settings' }).click();
  await panel.getByRole('button', { name: 'Back to search' }).click();
  await panel.getByLabel('What are you looking for?').fill('cancellation');
  await source.bringToFront();
  await panel.evaluate(() => {
    window.searchSubmissions = 0;
    document.querySelector('form').addEventListener('submit', () => { window.searchSubmissions++; });
  });
  for (const input of ['mouse', 'Enter', 'Space']) {
    const previousCalls = await panel.evaluate(() => window.localModelTest.calls.length);
    await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
    await panel.waitForFunction((count) => window.localModelTest.calls.length > count, previousCalls);
    const submissions = await panel.evaluate(() => window.searchSubmissions);
    const cancel = panel.getByRole('button', { name: 'Cancel search', exact: true });
    assert.equal(await cancel.textContent(), 'Cancel');
    assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (input === 'mouse') {
      await panel.screenshot({ path: 'artifacts/cancel-search.png' });
      if (inspect) { console.log('Cancel inspection ready on CDP port 9464.'); await new Promise((resolve) => setTimeout(resolve, 30000)); }
      await cancel.click();
    } else await cancel.press(input);
    await panel.getByText('Search cancelled.', { exact: true }).waitFor({ timeout: 5000 });
    await panel.waitForFunction(() => window.localModelTest.active === 0);
    assert.equal(await panel.evaluate(() => window.searchSubmissions), submissions, `${input} cancel must not resubmit`);
    assert.equal(await panel.locator('.search-progress').count(), 0);
    assert.equal(await panel.locator('.result-row').count(), 0);
    assert.equal(await panel.getByLabel('What are you looking for?').inputValue(), 'cancellation');
  }
  await panel.evaluate(() => { window.localModelTest.hold = false; });
  await panel.evaluate(() => document.querySelector('[aria-label="Find matching passages"]').click());
  await panel.getByRole('button', { name: 'Copy all', exact: true }).waitFor();
  console.log('Passed: mouse, Enter and Space cancel without resubmitting; sessions released, query preserved, explicit retry succeeds. Model inference is simulated.');
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
}
