import browser from './browser';
import type { PageCommand, PageReply, PageSnapshot, SearchResult } from '../core/types';

export const highlightCSS = `
::highlight(haystack-passages) { background: #f8efd3; color: #342c20; }
::highlight(haystack-focus) { background: #f0d78f; color: #342c20; }
::highlight(haystack-active) { background: #dabc6d; color: #342c20; text-decoration: underline; }
`;

export class PageClient {
  private port?: ReturnType<typeof browser.tabs.connect>;
  private tabId?: number;
  private generation = 0;

  async capture(tabId: number): Promise<PageSnapshot> {
    this.disconnect();
    const generation = this.generation;
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await browser.scripting.removeCSS({ target: { tabId }, css: highlightCSS });
      await browser.scripting.insertCSS({ target: { tabId }, css: highlightCSS });
    } catch {
      throw new Error('Click the Haystack toolbar icon on this page to allow access. Browser settings and extension stores cannot be searched.');
    }
    if (generation !== this.generation) throw new Error('Page capture cancelled.');
    this.tabId = tabId;
    this.port = browser.tabs.connect(tabId, { name: 'haystack-panel', frameId: 0 });
    const reply = await this.send({ type: 'capture' });
    if (!reply.page) throw new Error('Could not read this page. Reload it and try again.');
    if (!reply.page.passages.length) throw new Error('No readable text on this page. Try a page with selectable text.');
    return reply.page;
  }

  async highlight(result: SearchResult, active: number, scroll: boolean) {
    await this.send({ type: 'highlight', snapshotId: result.page.id, matches: result.matches,
      activeId: result.matches[active]?.id ?? '', scroll });
  }

  private async send(command: PageCommand) {
    if (this.tabId === undefined) throw new Error('Search the current page first.');
    let reply: PageReply;
    try { reply = await browser.tabs.sendMessage(this.tabId, command, { frameId: 0 }); }
    catch { throw new Error('The page is no longer available. Search the current page again.'); }
    if (!reply.ok) throw new Error(reply.error);
    return reply;
  }

  disconnect() {
    this.generation++;
    this.port?.disconnect();
    this.port = undefined;
    this.tabId = undefined;
  }
}
