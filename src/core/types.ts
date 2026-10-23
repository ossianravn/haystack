export interface Passage {
  id: string;
  text: string;
  heading: string;
  /** One-based physical page in the browser's PDF viewer. */
  pageNumber?: number;
}

export interface PageSnapshot {
  id: string;
  url: string;
  title: string;
  language?: string;
  passages: Passage[];
  pdf?: { pageCount: number; emptyPages: number[] };
}

export interface Span { start: number; end: number; text: string }
export interface ScoredMatch extends Passage { probability: number; focus: Span }
export interface LocalMatch extends Passage { local: true; focus: Span }
export type Match = ScoredMatch | LocalMatch;
interface ResultSource {
  page: PageSnapshot;
  query: string;
  elapsedMs: number;
  model: string;
}
export type SearchResult = ResultSource & (
  { provider: 'typesafe'; matches: ScoredMatch[]; threshold: number } |
  { provider: 'chrome-local'; matches: LocalMatch[] }
);

export type SearchProvider = 'typesafe' | 'chrome-local';
export interface Settings { provider: SearchProvider; apiKey: string; threshold: number }
export const DEFAULT_THRESHOLD = 0.58;

export class PDFSiteAccessRequired extends Error {
  constructor(readonly origin: string) {
    super(`Allow PDF access to ${new URL(origin).hostname} to search this document.`);
    this.name = 'PDFSiteAccessRequired';
  }
}

export type PageCommand =
  | { type: 'capture' }
  | { type: 'clear' }
  | { type: 'highlight'; snapshotId: string; matches: Match[]; activeId: string; scroll: boolean };

export type PageReply = { ok: true; page?: PageSnapshot } | { ok: false; error: string };
