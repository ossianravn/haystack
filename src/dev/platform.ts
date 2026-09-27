import type { Platform } from '../ui/platform';
import { DEFAULT_THRESHOLD, type Settings } from '../core/types';
import { sentences } from '../core/text';
import { samplePage } from './sample';

let settings: Settings = { provider: 'typesafe', apiKey: '', threshold: DEFAULT_THRESHOLD };
export const platform: Platform = {
  localModel: null,
  readSettings: async () => settings,
  saveSettings: async (next) => { settings = next; },
  removeKey: async () => { settings.apiKey = ''; },
  capture: async () => samplePage,
  requestPDFAccess: async () => true,
  highlight: async () => {},
  reset: () => {},
  subscribePageChange: () => () => {},
  subscribeSettingsChange: () => () => {},
  verifyKey: async () => {},
  async search(page, query, options, signal, progress) {
    signal.throwIfAborted();
    progress(page.passages.length);
    return { provider: 'typesafe', page, query, threshold: options.threshold, elapsedMs: 842, model: 'Preview sample',
      matches: page.passages.map((p, i) => ({ ...p, probability: .98 - i * .08, focus: sentences(p.text)[i === 0 ? 1 : 0] })) };
  },
  async saveMarkdown(markdown, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },
};
