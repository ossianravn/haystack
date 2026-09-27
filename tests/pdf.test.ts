import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfFixture } from './pdf-fixture.mjs';
import { pdfParagraphs, pdfPageURL } from '../src/core/pdf-text';
import { toMarkdown } from '../src/core/markdown';
import { searchPage } from '../src/core/typesafe';
import type { PageSnapshot } from '../src/core/types';

test('real PDF extraction preserves page references through matching and Markdown export', async () => {
  const task = getDocument({ data: new Uint8Array(pdfFixture()), useWasm: false, disableFontFace: true,
    standardFontDataUrl: `${path.resolve('node_modules/pdfjs-dist/standard_fonts')}/` });
  try {
    const pdf = await task.promise;
    const page: PageSnapshot = { id: 'pdf-test', title: 'Rules', url: 'https://example.com/rules.pdf?edition=2026',
      passages: [], pdf: { pageCount: pdf.numPages, emptyPages: [] } };
    for (let number = 1; number <= pdf.numPages; number++) {
      const blocks = pdfParagraphs(await (await pdf.getPage(number)).getTextContent());
      if (!blocks.length) page.pdf!.emptyPages.push(number);
      for (const text of blocks) page.passages.push({ id: `p${page.passages.length}`, text, heading: `PDF page ${number}`, pageNumber: number });
    }
    assert.equal(pdf.numPages, 3);
    assert.deepEqual(page.pdf?.emptyPages, [3]);
    assert.deepEqual(page.passages.map(({ text }) => text), [
      'An offside position alone is not an offence.',
      'Offside is penalised when a player interferes with play.',
    ]);
    const fetcher: typeof fetch = async () => Response.json({ model: 'pdf-test', answers: { p0: { noul: .9 }, p1: { noul: .95 } } });
    const result = await searchPage(page, 'Offside', { apiKey: 'test', threshold: .58 }, new AbortController().signal, () => {}, fetcher);
    assert.equal(result.matches[0].pageNumber, 2);
    const markdown = toMarkdown(result);
    assert.ok(markdown.includes('[PDF page 2](<https://example.com/rules.pdf?edition=2026#page=2>)'));
    assert.ok(markdown.indexOf('An offside') < markdown.indexOf('Offside is penalised'));
    assert.equal(pdfPageURL(`${page.url}#page=1&zoom=100`, 2), `${page.url}#page=2`);
  } finally { await task.destroy(); }
});
