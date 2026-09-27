import browser from './browser';
import type { Tabs } from 'webextension-polyfill';
import { PageClient } from './page-client';
import { documentURL, pdfPageURL } from '../core/pdf-text';
import type { PageSnapshot, SearchResult } from '../core/types';

export class DocumentClient {
  private web = new PageClient();
  private navigationFinished = Promise.resolve();
  private selection = 0;
  private pdf?: { tabId: number; snapshot: PageSnapshot; navigation: 'idle' | 'hash' | 'reload' | 'loading'; controller: AbortController };

  async capture(signal: AbortSignal, progress: (message: string) => void) {
    this.disconnect();
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    signal.throwIfAborted();
    if (tab?.id === undefined || !tab.url) throw new Error('Open a page or PDF and click the Haystack toolbar icon.');
    const url = new URL(tab.url);
    const isPDF = /\.pdf$/i.test(url.pathname) || /\.pdf$/i.test(tab.title ?? '');
    let webError: unknown;
    if (!isPDF) {
      try { return await this.web.capture(tab.id); }
      catch (cause) { webError = cause; this.web.disconnect(); }
    }
    signal.throwIfAborted();
    if (!['https:', 'http:', 'file:'].includes(url.protocol)) {
      throw webError ?? new Error('Open the PDF’s original address directly in a browser tab.');
    }
    const { readPDF } = await import('./pdf-reader');
    const title = tab.title && !tab.title.includes('/') ? tab.title : url.pathname.split('/').pop() || 'PDF';
    const snapshot = await readPDF(documentURL(tab.url), title, signal, progress, isPDF);
    signal.throwIfAborted();
    if (!snapshot) throw webError;
    this.pdf = { tabId: tab.id, snapshot, navigation: 'idle', controller: new AbortController() };
    return snapshot;
  }

  async highlight(result: SearchResult, active: number, scroll: boolean) {
    if (!result.page.pdf) return this.web.highlight(result, active, scroll);
    if (!scroll || !result.matches.length) return;
    const selected = ++this.selection;
    const previous = this.navigationFinished;
    let finished!: () => void;
    this.navigationFinished = new Promise<void>((resolve) => { finished = resolve; });
    try {
      await previous;
      if (selected === this.selection) await this.openPDFPage(result, active);
    } finally { finished(); }
  }

  private async openPDFPage(result: SearchResult, active: number) {
    const source = this.pdf;
    if (!source || source.snapshot.id !== result.page.id) throw new Error('Search this PDF again to refresh its page links.');
    const tab = await browser.tabs.get(source.tabId);
    if (this.pdf !== source) return;
    if (!tab.url || documentURL(tab.url) !== result.page.url) throw new Error('The document changed. Search the current PDF again.');
    const pageNumber = result.matches[active]?.pageNumber;
    if (!pageNumber) throw new Error('This match has no PDF page reference. Search the PDF again.');
    const url = pdfPageURL(result.page.url, pageNumber);
    source.navigation = 'hash';
    try {
      if (tab.url !== url) await this.updatePDFURL(source.tabId, url, source.controller.signal);
      if (this.pdf !== source) return;
      // Chromium ignores later hash changes. Reopening the same link also needs
      // a reload when the person has scrolled away from that page in either viewer.
      if (browser.runtime.getURL('').startsWith('chrome-extension:') || tab.url === url) {
        source.navigation = 'reload';
        await browser.tabs.reload(source.tabId);
      } else source.navigation = 'idle';
    } catch {
      if (source.controller.signal.aborted) return;
      source.navigation = 'idle';
      throw new Error('Could not open the matching PDF page. Try selecting the passage again.');
    }
  }

  private async updatePDFURL(tabId: number, url: string, signal: AbortSignal) {
    let changed: (id: number, info: Tabs.OnUpdatedChangeInfoType) => void;
    let aborted: () => void;
    const committed = new Promise<void>((resolve, reject) => {
      changed = (id, info) => { if (id === tabId && info.url === url) resolve(); };
      aborted = () => reject(signal.reason);
      browser.tabs.onUpdated.addListener(changed);
      signal.addEventListener('abort', aborted, { once: true });
    });
    try {
      // tabs.update can resolve before the URL commits. Reloading earlier loses #page.
      await Promise.all([browser.tabs.update(tabId, { url }), committed]);
    } finally {
      browser.tabs.onUpdated.removeListener(changed!);
      signal.removeEventListener('abort', aborted!);
    }
  }

  pageChanged(tabId: number, info: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) {
    if (this.pdf?.tabId === tabId && tab.url && documentURL(tab.url) === this.pdf.snapshot.url) {
      if (this.pdf.navigation !== 'idle') {
        if (info.status === 'loading' && this.pdf.navigation === 'reload') this.pdf.navigation = 'loading';
        if (info.status === 'complete' && this.pdf.navigation === 'loading') this.pdf.navigation = 'idle';
        return false;
      }
      if (info.url) return false;
    }
    return info.status === 'loading' || !!info.url;
  }

  disconnect() { this.selection++; this.web.disconnect(); this.pdf?.controller.abort(); this.pdf = undefined; }
}
