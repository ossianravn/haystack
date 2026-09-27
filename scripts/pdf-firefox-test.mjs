import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pdfFixture } from '../tests/pdf-fixture.mjs';

assert.ok(process.env.TYPESAFE_API_KEY, 'Provide .env for the live Firefox PDF test.');
const server = createServer((_, response) => { response.setHeader('Content-Type', 'application/pdf'); response.end(pdfFixture()); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/rules.pdf`;
const options = new firefox.Options().addArguments('-headless');
options.setPreference('browser.download.folderList', 2);
options.setPreference('browser.download.dir', path.resolve('test-results/downloads'));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options)
  .setFirefoxService(new firefox.ServiceBuilder(await download()).addArguments('--allow-system-access')).build();
try {
  // Install the actual release package. Access must come from the toolbar action.
  await driver.installAddon(path.resolve('dist/firefox'), true);
  await driver.get(url);
  const sourceHandle = await driver.getWindowHandle();
  await driver.setContext(firefox.Context.CHROME);
  const extensionURL = await driver.executeScript("return WebExtensionPolicy.getByID('haystack@extension.local').getURL('panel.html');");
  await driver.executeScript(() => {
    CustomizableUI.addWidgetToArea('haystack_extension_local-browser-action', CustomizableUI.AREA_NAVBAR);
  });
  await driver.findElement(By.id('haystack_extension_local-BAP')).click();
  await driver.setContext(firefox.Context.CONTENT);
  await driver.switchTo().newWindow('tab');
  await driver.get(extensionURL);
  const panelHandle = await driver.getWindowHandle();
  await driver.executeAsyncScript((key, done) => {
    browser.storage.local.set({ apiKey: key, threshold: .58 }).then(() => done(true), () => done(false));
  }, process.env.TYPESAFE_API_KEY);
  await driver.navigate().refresh();
  await driver.manage().window().setRect({ width: 420, height: 920 });
  await driver.wait(until.elementLocated(By.id('query')), 15000);
  await driver.findElement(By.id('query')).sendKeys('offside');
  await driver.executeAsyncScript((done) => {
    Promise.all([browser.tabs.query({}), browser.tabs.getCurrent()]).then(async ([tabs, current]) => {
      await browser.tabs.update(tabs.find((tab) => tab.id !== current.id).id, { active: true });
      done(true);
    }).catch((error) => done(error.message));
  });
  await driver.setContext(firefox.Context.CHROME);
  await driver.findElement(By.id('haystack_extension_local-BAP')).click();
  await driver.setContext(firefox.Context.CONTENT);
  await driver.executeScript(() => document.querySelector('[aria-label="Find matching passages"]').click());
  const allow = await driver.wait(until.elementLocated(By.css('[data-pdf-access]')), 15000);
  await allow.click();
  // This test's panel is a background tab, so Firefox anchors its permission
  // prompt there. Show that tab to accept the real browser prompt.
  await driver.switchTo().window(panelHandle);
  await driver.setContext(firefox.Context.CHROME);
  await driver.manage().window().setRect({ width: 1100, height: 920 });
  const permission = await driver.wait(until.elementLocated(By.css('#notification-popup .popup-notification-primary-button')), 15000);
  await driver.wait(async () => await driver.executeScript(() => document.getElementById('notification-popup').state === 'open'), 10000);
  await driver.executeScript((button) => button.click(), permission);
  await driver.setContext(firefox.Context.CONTENT);
  const submitted = await driver.executeAsyncScript((url, done) => {
    browser.tabs.query({}).then(async (tabs) => {
      await browser.tabs.update(tabs.find((tab) => tab.url === url).id, { active: true });
      setTimeout(() => { document.querySelector('[aria-label="Find matching passages"]').click(); done(true); }, 200);
    }).catch((error) => done(error.message));
  }, url);
  assert.equal(submitted, true, String(submitted));
  const origins = await driver.executeAsyncScript((done) => browser.permissions.getAll().then((permissions) => done(permissions.origins)));
  assert.ok(origins.includes('http://127.0.0.1/*'));
  assert.ok(!origins.includes('http://*/*') && !origins.includes('https://*/*'));
  await driver.wait(async () => (await driver.findElements(By.css('.export-actions, [role="alert"]'))).length, 45000);
  const errors = await driver.findElements(By.css('[role="alert"]'));
  assert.equal(errors.length, 0, errors[0] ? await errors[0].getText() : '');
  assert.equal((await driver.findElements(By.css('.result-row'))).length, 2);
  assert.ok((await driver.findElement(By.css('.source-line')).getText()).includes('3 PDF pages'));
  await driver.executeScript(() => document.querySelector('[aria-label^="Open PDF page 2:"]').click());
  await driver.wait(async () => await driver.executeAsyncScript((done) => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => done(tab.url.endsWith('#page=2')));
  }), 10000);
  assert.equal((await driver.findElements(By.css('.result-row'))).length, 2);
  await driver.executeScript(() => {
    const css = document.createElement('style'); css.textContent = '* { transition:none!important; animation:none!important; }'; document.head.append(css);
  });
  await writeFile('artifacts/firefox-pdf.png', Buffer.from(await driver.takeScreenshot(), 'base64'));
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
  assert.equal((markdown.match(/^## /gm) || []).length, 2);
  assert.ok(markdown.includes('[PDF page 2]') && markdown.includes('#page=2'));
  await driver.switchTo().window(sourceHandle);
  await driver.wait(async () => await driver.executeScript(() => document.querySelector('#pageNumber')?.value === '2'), 10000);
  await driver.switchTo().window(panelHandle);
  console.log(JSON.stringify({ passed: true, browser: 'Firefox', matches: 2,
    checks: ['release activeTab via toolbar', 'per-site PDF permission', 'live TypeSafe', 'PDF extraction', 'native viewer page 2', 'retained results', 'Markdown page links'] }));
} catch (error) {
  await driver.setContext(firefox.Context.CONTENT);
  console.error(await driver.findElement(By.css('body')).getText());
  await writeFile('test-results/firefox-pdf-failure.png', Buffer.from(await driver.takeScreenshot(), 'base64'));
  throw error;
} finally {
  await driver.quit();
  await new Promise((resolve) => server.close(resolve));
}
