import { chromium } from 'playwright';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function navigationBrowser(name, url) {
  const directory = path.resolve(`test-results/navigation-${name}`);
  await mkdir(directory, { recursive: true });
  await cp(`dist/${name}`, directory, { recursive: true });
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
  // Only the isolated test copy receives fixture/site access without a toolbar click.
  manifest.host_permissions.push(`${new URL(url).protocol}//${new URL(url).hostname}/*`);
  await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest));

  if (name === 'firefox') {
    const binary = await download();
    const driver = await new Builder().forBrowser('firefox')
      .setFirefoxOptions(new firefox.Options().addArguments('-headless'))
      .setFirefoxService(new firefox.ServiceBuilder(binary).addArguments('--allow-system-access')).build();
    try {
      await driver.manage().window().setRect({ width: 1400, height: 1000 });
      await driver.installAddon(directory, true);
      await driver.get(url);
      await driver.wait(until.elementLocated(By.css('tbody tr')), 20000);
      const source = await driver.getWindowHandle();
      await driver.setContext(firefox.Context.CHROME);
      const extensionURL = await driver.executeScript("return WebExtensionPolicy.getByID('haystack@extension.local').getURL('panel.html');");
      await driver.setContext(firefox.Context.CONTENT);
      await driver.switchTo().newWindow('tab');
      await driver.get(extensionURL);
      const panel = await driver.getWindowHandle();
      const captured = await driver.executeAsyncScript((url, done) => {
        (async () => {
          const tab = (await browser.tabs.query({})).find((tab) => tab.url === url);
          window.navigationTab = tab.id;
          await browser.tabs.update(tab.id, { active: true });
          await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          return browser.tabs.sendMessage(tab.id, { type: 'capture' });
        })().then(done, (error) => done({ ok: false, error: error.message }));
      }, url);
      return { captured,
        evaluate: async (fn, arg) => { await driver.switchTo().window(source); return driver.executeScript(fn, arg); },
        send: async (commands) => {
          await driver.switchTo().window(panel);
          return driver.executeAsyncScript((commands, done) => {
            browser.tabs.update(window.navigationTab, { active: true })
              .then(() => Promise.all(commands.map((command) => browser.tabs.sendMessage(window.navigationTab, command))))
              .then(done, (error) => done([{ ok: false, error: error.message }]));
          }, commands);
        },
        close: () => driver.quit(),
      };
    } catch (error) {
      await driver.quit();
      throw error;
    }
  }

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    executablePath: process.env.HAYSTACK_CHROMIUM || undefined,
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1400, height: 900 },
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const source = await context.newPage();
    await source.goto(url);
    await source.locator('tbody tr').first().waitFor();
    const captured = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      self.navigationTab = tab.id;
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return chrome.tabs.sendMessage(tab.id, { type: 'capture' });
    }, url);
    return { captured,
      evaluate: (fn, arg) => source.evaluate(fn, arg),
      send: (commands) => worker.evaluate((commands) =>
        Promise.all(commands.map((command) => chrome.tabs.sendMessage(self.navigationTab, command))), commands),
      close: () => context.close(),
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}
