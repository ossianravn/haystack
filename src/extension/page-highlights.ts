import { capturePage, rangeFor, type CapturedRange } from './capture';
import { afterScroll, restorePosition } from './text-anchor';
import type { Match } from '../core/types';

type Snapshot = ReturnType<typeof capturePage>;
interface LocatedMatch { source: CapturedRange; sentence: Range }
const changed = 'The page text changed. Search again to refresh the matches.';

function current(source: CapturedRange) {
  return source.nodes.every((node) => node.isConnected) && source.range.toString() === source.text &&
    source.anchor.context.textContent === source.anchor.contextText;
}

function locate(snapshot: Snapshot, matches: Match[]) {
  const located = new Map<string, LocatedMatch>();
  let replacements: Map<string, CapturedRange[]> | undefined;
  for (const match of matches) {
    let source = snapshot.ranges.get(match.id);
    if (!source) continue;
    if (!current(source)) {
      if (!replacements) {
        replacements = new Map();
        for (const candidate of capturePage().ranges.values()) {
          const same = replacements.get(candidate.key) ?? [];
          same.push(candidate);
          replacements.set(candidate.key, same);
        }
      }
      const candidates = replacements.get(source.key) ?? [];
      const owner = source.anchor.owner;
      const sameOwner = candidates.filter((candidate) => candidate.anchor.owner === owner);
      source = sameOwner.length === 1 ? sameOwner[0] : candidates.length === 1 ? candidates[0] : undefined;
      if (!source) continue;
      snapshot.ranges.set(match.id, source);
    }
    if (source.text !== match.text) continue;
    const sentence = rangeFor(source.nodes, source.span.start + match.focus.start, source.span.start + match.focus.end);
    if (sentence.toString() === match.focus.text) located.set(match.id, { source, sentence });
  }
  return located;
}

export class PageHighlights {
  private revision = 0;

  clear() {
    this.revision++;
    this.removeHighlights();
  }

  private removeHighlights() {
    for (const name of ['haystack-passages', 'haystack-focus', 'haystack-active']) CSS.highlights?.delete(name);
  }

  async show(snapshot: Snapshot, matches: Match[], activeId: string, scroll: boolean) {
    const revision = ++this.revision;
    try {
      let located = locate(snapshot, matches);
      if (scroll) {
        let active = located.get(activeId);
        if (!active) {
          const original = snapshot.ranges.get(activeId);
          if (!original) throw new Error(changed);
          restorePosition(original.anchor);
          await afterScroll();
          if (revision !== this.revision) return;
          located = locate(snapshot, matches);
          active = located.get(activeId);
        }
        if (!active) throw new Error(changed);
        // A jump is immediate; rebuild ranges after the table processes the scroll.
        active.sentence.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        await afterScroll();
        if (revision !== this.revision) return;
        located = locate(snapshot, matches);
        if (!located.has(activeId)) throw new Error(changed);
      }
      this.removeHighlights();
      if (!CSS.highlights || typeof Highlight === 'undefined') return;
      const visible = [...located.values()];
      CSS.highlights.set('haystack-passages', new Highlight(...visible.map(({ source }) => source.range)));
      const focus = new Highlight(...visible.map(({ sentence }) => sentence));
      focus.priority = 1;
      CSS.highlights.set('haystack-focus', focus);
      const active = located.get(activeId);
      const selected = new Highlight(...(active ? [active.sentence] : []));
      selected.priority = 2;
      CSS.highlights.set('haystack-active', selected);
    } catch (error) {
      if (revision !== this.revision) return;
      this.removeHighlights();
      throw error;
    }
  }
}
