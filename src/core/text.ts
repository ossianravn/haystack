import type { Span } from './types';

export function sentences(text: string): Span[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  return Array.from(segmenter.segment(text), ({ segment, index }) => {
    const start = index + segment.length - segment.trimStart().length;
    return { start, end: start + segment.trim().length, text: segment.trim() };
  }).filter((span) => span.text.length > 0);
}

// Split, rather than omit, long text. Offsets always refer to the original DOM text.
export function passages(text: string, size = 1800): Span[] {
  const chunks: Span[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > start + size / 2) end = boundary;
      if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--;
    }
    const sentenceParts = sentences(text.slice(start, end));
    if (sentenceParts.length > 200) end = start + sentenceParts[199].end;
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    const offset = start + raw.length - raw.trimStart().length;
    if (trimmed) chunks.push({ start: offset, end: offset + trimmed.length, text: trimmed });
    start = end;
  }
  return chunks;
}
