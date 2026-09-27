import browser from './browser';
import type { Runtime } from 'webextension-polyfill';
import { capturePage } from './capture';
import { PageHighlights } from './page-highlights';
import type { PageCommand, PageReply } from '../core/types';

const installed = '__haystackInstalled';
const context = globalThis as typeof globalThis & { [installed]?: boolean };

if (!context[installed]) {
  context[installed] = true;
  let captured: ReturnType<typeof capturePage> | undefined;
  const highlights = new PageHighlights();
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'haystack-panel') port.onDisconnect.addListener(() => { highlights.clear(); captured = undefined; });
  });
  browser.runtime.onMessage.addListener((raw: unknown, sender: Runtime.MessageSender): Promise<PageReply> | undefined => {
    if (sender.id !== browser.runtime.id || !raw || typeof raw !== 'object' || !('type' in raw)) return;
    const command = raw as PageCommand;
    if (!['capture', 'clear', 'highlight'].includes(command.type)) return;
    return (async (): Promise<PageReply> => {
      try {
        if (command.type === 'clear') { highlights.clear(); return { ok: true }; }
        if (command.type === 'capture') {
          highlights.clear();
          captured = capturePage();
          return { ok: true, page: captured.page };
        }
        if (!captured || captured.page.id !== command.snapshotId || captured.page.url !== location.href) {
          highlights.clear();
          throw new Error('The page changed. Search again to refresh the matches.');
        }
        await highlights.show(captured, command.matches, command.activeId, command.scroll);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not read the page.' };
      }
    })();
  });
}
