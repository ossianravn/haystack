import type { PageSnapshot, SearchResult, Settings } from '../core/types';
import type { LocalModel } from '../local/model';

export interface Platform {
  localModel: LocalModel | null;
  readSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  removeKey(): Promise<void>;
  capture(signal: AbortSignal, progress: (message: string) => void): Promise<PageSnapshot>;
  requestPDFAccess(origin: string): Promise<boolean>;
  highlight(result: SearchResult, active: number, scroll: boolean): Promise<void>;
  reset(): void;
  subscribePageChange(listener: () => void): () => void;
  subscribeSettingsChange(listener: () => void): () => void;
  search(page: PageSnapshot, query: string, settings: Settings, signal: AbortSignal, progress: (count: number) => void): Promise<SearchResult>;
  verifyKey(key: string, signal: AbortSignal): Promise<void>;
  saveMarkdown(markdown: string, filename: string): Promise<void>;
}
