import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';

interface Line { text: string; x: number; y: number; height: number }

// PDF.js supplies reading order. Keep it: sorting by coordinates breaks columns
// and rotated text. Geometry is used only to recover spaces and paragraph breaks.
export function pdfParagraphs(content: TextContent): string[] {
  const lines: Line[] = [];
  let line: Line | undefined;
  let previous: TextItem | undefined;
  const flush = () => {
    if (line?.text.trim()) lines.push({ ...line, text: line.text.trim() });
    line = undefined;
    previous = undefined;
  };
  for (const item of content.items) {
    if (!('str' in item)) continue;
    if (item.str) {
      const [x, y] = [item.transform[4], item.transform[5]];
      if (line && Math.abs(y - line.y) > Math.max(item.height, line.height) * .5) flush();
      if (!line) line = { text: '', x, y, height: item.height || 1 };
      const gap = previous ? x - previous.transform[4] - previous.width : 0;
      if (previous && gap > line.height * .12 && !/\s$/.test(line.text) && !/^\s/.test(item.str)) line.text += ' ';
      line.text += item.str;
      previous = item;
    }
    if (item.hasEOL) flush();
  }
  flush();
  const paragraphs: string[] = [];
  let last: Line | undefined;
  for (const current of lines) {
    const separated = !last || Math.abs(current.y - last.y) > Math.max(current.height, last.height) * 1.8
      || current.y > last.y + last.height
      || Math.abs(current.height - last.height) > Math.max(current.height, last.height) * .2;
    if (separated) paragraphs.push(current.text);
    else paragraphs[paragraphs.length - 1] += `\n${current.text}`;
    last = current;
  }
  return paragraphs;
}

export function pdfPageURL(source: string, pageNumber: number) {
  const url = new URL(source);
  url.hash = `page=${pageNumber}`;
  return url.href;
}

export function documentURL(source: string) {
  const url = new URL(source);
  url.hash = '';
  return url.href;
}
