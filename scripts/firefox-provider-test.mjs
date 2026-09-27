import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import path from 'node:path';

const driver = await new Builder().forBrowser('firefox')
  .setFirefoxOptions(new firefox.Options().addArguments('-headless'))
  .setFirefoxService(new firefox.ServiceBuilder(await download()).addArguments('--allow-system-access')).build();
try {
  await driver.installAddon(path.resolve('dist/firefox'), true);
  await driver.setContext(firefox.Context.CHROME);
  const url = await driver.executeScript("return WebExtensionPolicy.getByID('haystack@extension.local').getURL('panel.html');");
  await driver.setContext(firefox.Context.CONTENT);
  await driver.get(url);
  // A Chrome-only setting must not activate a local provider in Firefox.
  await driver.executeAsyncScript((done) => {
    browser.storage.local.set({ provider: 'chrome-local', apiKey: 'fixture-key', threshold: .65 }).then(() => done(true));
  });
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(By.css('.app-footer')), 10000);
  await driver.wait(async () => (await driver.findElement(By.css('.app-footer')).getText()).includes('TypeSafe connected'), 10000);
  await driver.findElement(By.css('[aria-label="Open settings"]')).click();
  const key = await driver.wait(until.elementLocated(By.id('api-key')), 10000);
  await driver.wait(async () => await key.getAttribute('value') === 'fixture-key', 10000);
  assert.equal((await driver.findElements(By.css('[data-slot="toggle-group"]'))).length, 0);
  assert.ok(!(await driver.findElement(By.css('body')).getText()).includes('Gemini Nano'));
  console.log(JSON.stringify({ passed: true, browser: 'Firefox', checks: ['Jev readiness', 'existing settings retained', 'Chrome provider unavailable'] }));
} finally { await driver.quit(); }
