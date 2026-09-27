import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Copy, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { matchMarkdown, markdownFilename, toMarkdown } from '../core/markdown';
import type { SearchResult } from '../core/types';
import type { Platform } from './platform';

export function Results({ result, active, select, clear, platform }: {
  result: SearchResult; active: number; select: (index: number) => void; clear: () => void; platform: Platform;
}) {
  const [copied, setCopied] = useState('');
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  async function copy(text: string, id: string) {
    setFailed(false);
    try { await navigator.clipboard.writeText(text); setCopied(id); setFeedback(id === 'all' ? `Copied all ${result.matches.length} matches as Markdown.` : 'Passage copied as Markdown.'); }
    catch { setFailed(true); setFeedback('Clipboard access failed. Use Save .md to export the matches.'); }
  }
  async function save() {
    setFailed(false);
    try { await platform.saveMarkdown(toMarkdown(result), markdownFilename(result.page.title)); setFeedback('Markdown file sent to your browser’s downloads.'); }
    catch { setFailed(true); setFeedback('Download was cancelled or could not start. You can try Save .md again.'); }
  }
  const count = result.matches.length;
  return <>
    <div className="results-toolbar"><div><strong>{count}</strong> {count === 1 ? 'match' : 'matches'}<span className="timing">{(result.elapsedMs / 1000).toFixed(1)}s</span></div>
      <div className="navigation"><span>{count ? active + 1 : 0} / {count}</span>
        <Button variant="ghost" size="icon" aria-label="Previous match" disabled={!count} onClick={() => select(active - 1)}><ArrowUp /></Button>
        <Button variant="ghost" size="icon" aria-label="Next match" disabled={!count} onClick={() => select(active + 1)}><ArrowDown /></Button>
        <Button variant="ghost" size="icon" aria-label="Clear results and highlights" onClick={clear}><X /></Button>
      </div>
    </div>
    <ol className="results-list" aria-label="Matching passages">
      {result.matches.map((match, index) => <li key={match.id} className="result-row" data-active={active === index}>
        <button className="passage-button" aria-label={match.pageNumber ? `Open PDF page ${match.pageNumber}: match ${index + 1}` : `Go to match ${index + 1}: ${match.heading || match.focus.text}`}
          aria-current={active === index ? 'true' : undefined} onClick={() => select(index)}>
          <span className="passage-meta"><span className="passage-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="passage-heading">{match.heading || 'On this page'}</span><ArrowUpRight size={14} /></span>
          <span className="passage-text">{match.text.slice(0, match.focus.start)}<mark>{match.focus.text}</mark>{match.text.slice(match.focus.end)}</span>
        </button>
        <div className="passage-footer"><span>{'probability' in match ? `${Math.round(match.probability * 100)}% relevance` : 'Matched locally'}</span>
          <Button variant="ghost" size="icon" aria-label={`Copy match ${index + 1} as Markdown`} onClick={() => copy(matchMarkdown(match, result.page.url), match.id)}>
            {copied === match.id ? <Check /> : <Copy />}</Button></div>
      </li>)}
    </ol>
    {!count && <div className="no-results"><h2>No matching passages.</h2><p>{result.provider === 'typesafe' ? 'Try describing the idea differently, or lower the match threshold in Settings.' : 'Try describing the idea differently.'}</p></div>}
    {!!count && <footer className="export-bar"><div className="export-actions">
      <Button onClick={() => copy(toMarkdown(result), 'all')}>{copied === 'all' ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}Copy all</Button>
      <Button variant="outline" onClick={save}><Download data-icon="inline-start" />Save .md</Button>
    </div><p className="export-note">All {count} passages · Markdown · source included</p>
      {feedback && <p className="export-feedback" role={failed ? 'alert' : 'status'}>{feedback}</p>}
    </footer>}
  </>;
}
