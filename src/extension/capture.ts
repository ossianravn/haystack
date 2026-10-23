import { passages } from '../core/text';
import type { PageSnapshot, Span } from '../core/types';
import { anchorText, type TextAnchor } from './text-anchor';

export interface CapturedRange { range: Range; text: string; nodes: Text[]; span: Span; anchor: TextAnchor; key: string }
const excluded = 'script,style,noscript,template,svg,canvas,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]';
const boundaries = 'p,li,pre,blockquote,h1,h2,h3,h4,h5,h6,td,th,figcaption,dt,dd,div,section,article,main,body';

export function rangeFor(nodes: Text[], start: number, end: number) {
  const range = new Range();
  let offset = 0;
  let started = false;
  for (const node of nodes) {
    const next = offset + node.length;
    if (!started && start < next) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && end <= next) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset = next;
  }
  throw new Error('This passage changed. Search the page again.');
}

export function capturePage() {
  const page: PageSnapshot = { id: crypto.randomUUID(), title: document.title, language: document.documentElement.lang, url: location.href, passages: [] };
  const ranges = new Map<string, CapturedRange>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const visible = new WeakMap<Element, boolean>();
  const anchors = new WeakMap<Element, TextAnchor>();
  let group: Text[] = [];
  let owner: Element | null = null;
  let heading = '';
  function flush() {
    if (!group.length || !owner) return;
    const text = group.map((node) => node.data).join('');
    const isHeading = owner && /^H[1-6]$/.test(owner.tagName);
    if (isHeading) heading = text.trim();
    for (const span of passages(text)) {
      const id = `p${page.passages.length}`;
      const range = rangeFor(group, span.start, span.end);
      let anchor = anchors.get(owner);
      if (!anchor) { anchor = anchorText(owner); anchors.set(owner, anchor); }
      page.passages.push({ id, text: span.text, heading: isHeading ? '' : heading });
      ranges.set(id, { range, text: span.text, nodes: group, span, anchor,
        key: JSON.stringify([anchor.key, text, span.start, span.end]) });
    }
    group = [];
  }
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node instanceof Element) {
      if (node.tagName === 'BR') flush();
      continue;
    }
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded)) { flush(); owner = null; continue; }
    let shown = visible.get(parent);
    if (shown === undefined) {
      shown = parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      visible.set(parent, shown);
    }
    if (!shown) { flush(); owner = null; continue; }
    const nextOwner = parent.closest(boundaries) ?? parent;
    if (nextOwner !== owner) { flush(); owner = nextOwner; }
    group.push(node as Text);
  }
  flush();
  return { page, ranges };
}
