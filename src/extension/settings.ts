import browser from './browser';
import { DEFAULT_THRESHOLD, type Settings } from '../core/types';
import { isChromeBuild } from './browser-target';

export async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(['provider', 'apiKey', 'threshold']);
  return {
    provider: isChromeBuild && stored.provider === 'chrome-local' ? 'chrome-local' : 'typesafe',
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
    threshold: typeof stored.threshold === 'number' && stored.threshold >= 0 && stored.threshold <= 1
      ? stored.threshold : DEFAULT_THRESHOLD,
  };
}

export async function saveSettings(settings: Settings) {
  await browser.storage.local.set({ provider: isChromeBuild ? settings.provider : 'typesafe', apiKey: settings.apiKey.trim(), threshold: settings.threshold });
}

export async function removeKey() {
  await browser.storage.local.remove('apiKey');
}
