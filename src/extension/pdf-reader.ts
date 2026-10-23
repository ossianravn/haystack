import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerURL from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { pdfParagraphs } from '../core/pdf-text';
import { passages } from '../core/text';
import { PDFSiteAccessRequired, type PageSnapshot } from '../core/types';
import browser from './browser';

GlobalWorkerOptions.workerSrc = workerURL;

export async function readPDF(url: string, title: string, signal: AbortSignal,
  progress: (message: string) => void, required: boolean): Promise<PageSnapshot | null> {
  signal.throwIfAborted();
  if (browser.runtime.getURL('').startsWith('moz-extension:')) {
    const source = new URL(url);
    if (source.protocol === 'file:') throw new Error('In Firefox, open this PDF from its website to search it. Local PDF files are not supported yet.');
    const origin = `${source.protocol}//${source.hostname}/*`;
    if (!await browser.permissions.contains({ origins: [origin] })) {
      // A blank/restricted webpage must retain its original capture error.
      if (!required) return null;
      throw new PDFSiteAccessRequired(origin);
    }
    signal.throwIfAborted();
  }
  progress('Opening the PDF…');
  let response: Response;
  try { response = await fetch(url, { signal, credentials: 'include' }); }
  catch {
    signal.throwIfAborted();
    if (!required) return null;
    throw new Error('Could not read this PDF. Click Haystack’s toolbar icon on the PDF tab to allow access, then try again. For local files, enable file access in the extension’s browser settings.');
  }
  if (!response.ok) {
    if (!required) return null;
    throw new Error(`Could not download the PDF (HTTP ${response.status}). Open the PDF directly in a tab and try again.`);
  }
  if (!required && !/application\/(pdf|octet-stream)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    return null;
  }
  const data = new Uint8Array(await response.arrayBuffer());
  signal.throwIfAborted();
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) {
    if (!required) return null;
    throw new Error('This address did not return a PDF. Open the PDF directly in a tab and try again.');
  }
  const task = getDocument({ data, useWasm: false, disableFontFace: true, stopAtErrors: true,
    cMapUrl: browser.runtime.getURL('pdf-assets/cmaps/'), cMapPacked: true,
    standardFontDataUrl: browser.runtime.getURL('pdf-assets/standard_fonts/') });
  // Passwords belong to the viewer; do not prompt for or retain them in Haystack.
  let destroy: Promise<void> | undefined;
  const dispose = () => { destroy ??= task.destroy(); return destroy; };
  const abort = () => { void dispose().catch(() => console.error('Haystack could not finish closing the PDF worker.')); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    const snapshot: PageSnapshot = { id: crypto.randomUUID(), url, title, passages: [],
      pdf: { pageCount: pdf.numPages, emptyPages: [] } };
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      progress(`Reading PDF page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      snapshot.language ||= content.lang ?? undefined;
      const blocks = pdfParagraphs(content);
      if (!blocks.length) snapshot.pdf!.emptyPages.push(number);
      for (const block of blocks) for (const span of passages(block)) {
        snapshot.passages.push({ id: `p${snapshot.passages.length}`, text: span.text,
          heading: `PDF page ${number}`, pageNumber: number });
      }
      page.cleanup();
    }
    signal.throwIfAborted();
    if (!snapshot.passages.length) throw new Error('This PDF has no extractable text. For a scanned document, run OCR first and open the resulting PDF.');
    return snapshot;
  } catch (cause) {
    signal.throwIfAborted();
    if (cause instanceof Error && cause.name === 'PasswordException') {
      throw new Error('This PDF is password protected. Open an unprotected copy to search it with Haystack.');
    }
    if (cause instanceof Error && cause.message.startsWith('This PDF')) throw cause;
    throw new Error('Could not extract all of this PDF’s text. Try downloading a fresh copy and opening it in a tab.');
  } finally {
    signal.removeEventListener('abort', abort);
    await dispose();
  }
}
