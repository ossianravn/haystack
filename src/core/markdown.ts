import type { Match, SearchResult } from './types';
import { pdfPageURL } from './pdf-text';

export function escapeMarkdown(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>()#+\-.!|~])/g, '\\$1');
}

export function matchMarkdown(match: Match, sourceURL?: string) {
  const quote = escapeMarkdown(match.text).split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  const reference = match.pageNumber && sourceURL
    ? `[PDF page ${match.pageNumber}](<${pdfPageURL(sourceURL, match.pageNumber).replace(/[<>\s]/g, encodeURIComponent)}>)\n\n` : '';
  return reference + quote;
}

export function toMarkdown(result: SearchResult) {
  const order = new Map(result.page.passages.map((passage, index) => [passage.id, index]));
  const matches = [...result.matches].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const url = result.page.url.replace(/[<>\s]/g, (char) => encodeURIComponent(char));
  return [
    `# ${escapeMarkdown(result.page.title || 'Haystack excerpts')}`,
    `Source: <${url}>`,
    `Search: ${escapeMarkdown(result.query)}`,
    ...(result.page.pdf?.emptyPages.length ? [`Pages without extractable text: ${result.page.pdf.emptyPages.join(', ')}. Images and scans were not searched.`] : []),
    `${matches.length} matching passages · ${result.model}${result.provider === 'typesafe' ? ` · relevance threshold ${result.threshold}` : ' · local relevance decisions'}`,
    ...matches.map((match, i) => `## ${i + 1}. ${escapeMarkdown(match.heading || 'Passage')}\n\n${matchMarkdown(match, result.page.url)}`),
    '',
  ].join('\n\n');
}

export function markdownFilename(title: string) {
  const stem = title.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '').trim().slice(0, 100).replace(/[. ]+$/g, '') || 'excerpts';
  return `haystack-${stem}.md`;
}
