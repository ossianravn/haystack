import browser from './browser';
import type { Tabs } from 'webextension-polyfill';
import { DocumentClient } from './document-client';
import { readSettings, saveSettings, removeKey } from './settings';
import { searchPage, verifyKey } from '../core/typesafe';
import type { Platform } from '../ui/platform';
import { isChromeBuild } from './browser-target';
import { ChromeModel } from '../local/model';
import { searchLocal } from '../local/search';

const client = new DocumentClient();
const localModel = isChromeBuild ? new ChromeModel() : null;
export const platform: Platform = {
  localModel,
  readSettings, saveSettings, removeKey, verifyKey,
  capture: (signal, progress) => client.capture(signal, progress),
  requestPDFAccess: (origin) => browser.permissions.request({ origins: [origin] }),
  highlight: (result, active, scroll) => client.highlight(result, active, scroll),
  reset: () => client.disconnect(),
  search: (page, query, settings, signal, progress) => {
    if (settings.provider === 'chrome-local') {
      if (!localModel) throw new Error('Local search requires Chrome. Select TypeSafe in Settings.');
      return searchLocal(localModel, page, query, signal, progress);
    }
    return searchPage(page, query, settings, signal, progress);
  },
  subscribeSettingsChange(listener) {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ['provider', 'apiKey', 'threshold'].some((key) => key in changes)) listener();
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  },
  subscribePageChange(listener) {
    let windowId: number | undefined;
    browser.windows.getCurrent().then((window) => { windowId = window.id; })
      .catch(() => console.error('Haystack could not identify the active window.'));
    const activated = (info: { windowId: number }) => { if (info.windowId === windowId) listener(); };
    const updated = (tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
      if (tab.active && tab.windowId === windowId && client.pageChanged(tabId, info, tab)) listener();
    };
    browser.tabs.onActivated.addListener(activated);
    browser.tabs.onUpdated.addListener(updated);
    return () => {
      browser.tabs.onActivated.removeListener(activated);
      browser.tabs.onUpdated.removeListener(updated);
      client.disconnect();
    };
  },
  async saveMarkdown(markdown, filename) {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try { await browser.downloads.download({ url, filename, saveAs: true }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
  },
};
