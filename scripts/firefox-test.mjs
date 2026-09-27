import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

assert.ok(process.env.TYPESAFE_API_KEY, 'Provide .env for the live Firefox integration test.');
const fixture = await readFile('tests/fixture.html');
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(fixture); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const directory = path.resolve('test-results/firefox-extension');
await mkdir('test-results', { recursive: true });
await cp('dist/firefox', directory, { recursive: true });
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest));
const binary = await download();
const options = new firefox.Options().addArguments('-headless');
options.setPreference('browser.download.folderList', 2);
options.setPreference('browser.download.dir', path.resolve('test-results/downloads'));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options)
  .setFirefoxService(new firefox.ServiceBuilder(binary).addArguments('--allow-system-access')).build();
try {
  await driver.installAddon(directory, true);
  await driver.get(origin);
  const sourceHandle = await driver.getWindowHandle();
  await driver.setContext(firefox.Context.CHROME);
  const extensionURL = await driver.executeScript("return WebExtensionPolicy.getByID('haystack@extension.local').getURL('panel.html');");
  await driver.setContext(firefox.Context.CONTENT);
  await driver.switchTo().newWindow('tab');
  await driver.get(extensionURL);
  await driver.executeAsyncScript((key, done) => {
    browser.storage.local.set({ apiKey: key, threshold: .58 }).then(() => done(true), () => done(false));
  }, process.env.TYPESAFE_API_KEY);
  await driver.navigate().refresh();
  await driver.manage().window().setRect({ width: 420, height: 920 });
  const query = await driver.wait(until.elementLocated(By.id('query')), 15000);
  await query.sendKeys('What happens if I cancel my trip?');
  await driver.executeAsyncScript((url, done) => {
    browser.tabs.query({}).then(async (tabs) => {
      const source = tabs.find((tab) => tab.url?.startsWith(url));
      await browser.tabs.update(source.id, { active: true });
      setTimeout(() => { document.querySelector('[aria-label="Find matching passages"]').click(); done(true); }, 200);
    }).catch((error) => done(error.message));
  }, origin);
  await driver.wait(async () => (await driver.findElements(By.css('.export-actions'))).length > 0, 45000);
  const matches = await driver.findElements(By.css('.result-row'));
  assert.ok(matches.length >= 2);
  const text = await driver.findElement(By.css('.results-list')).getText();
  assert.ok(text.includes('25 euro fee') && text.includes('five working days'));
  assert.ok(!text.includes('dining car'));
  const searchBackground = await driver.executeScript(() => {
    // Firefox suspends transitions in this background test tab; settle them for screenshots.
    const css = document.createElement('style');
    css.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.append(css);
    const button = document.querySelector('[aria-label="Find matching passages"]');
    return getComputedStyle(button).backgroundColor;
  });
  assert.notEqual(searchBackground, 'rgba(0, 0, 0, 0)', 'Search action must have a visible background.');
  await writeFile('artifacts/firefox-results.png', Buffer.from(await driver.takeScreenshot(), 'base64'));
  const saved = await driver.executeAsyncScript((done) => {
    const original = browser.downloads.download.bind(browser.downloads);
    browser.downloads.download = (options) => original({ ...options, saveAs: false });
    document.querySelectorAll('.export-actions button')[1].click();
    const timer = setInterval(async () => {
      const files = await browser.downloads.search({ limit: 1, orderBy: ['-startTime'] });
      if (files[0]?.state === 'complete') { clearInterval(timer); done(files[0].filename); }
    }, 100);
  });
  const markdown = await readFile(saved, 'utf8');
  assert.equal((markdown.match(/^## /gm) || []).length, matches.length);
  assert.ok(markdown.includes('25 euro fee') && markdown.includes('five working days'));
  await driver.switchTo().window(sourceHandle);
  const highlights = await driver.executeScript("return CSS.highlights.get('haystack-passages')?.size;");
  // Returning to a tab already selected by the extension does not change the active tab.
  assert.equal(highlights, matches.length);
  console.log(JSON.stringify({ passed: true, browser: 'Firefox', matches: matches.length,
    checks: ['MV3 install', 'extension storage', 'live TypeSafe', 'page capture', 'highlights', 'Markdown download'] }));
} finally {
  await driver.quit();
  await new Promise((resolve) => server.close(resolve));
}
