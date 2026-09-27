import { useEffect, useState } from 'react';
import { ArrowRight, FileText, LoaderCircle, Search, Settings2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Brand } from './Brand';
import { Settings } from './Settings';
import { Results } from './Results';
import { useSearch } from './use-search';
import type { Platform } from './platform';
import type { SearchProvider } from '../core/types';

export function App({ platform }: { platform: Platform }) {
  const [settings, setSettings] = useState(location.pathname.includes('options'));
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [provider, setProvider] = useState<SearchProvider>('typesafe');
  const [modelMessage, setModelMessage] = useState('');
  const [settingsRevision, setSettingsRevision] = useState(0);
  const search = useSearch(platform);
  useEffect(() => platform.subscribeSettingsChange(() => {
    search.clear();
    setSettingsRevision((revision) => revision + 1);
  }), [platform]);
  useEffect(() => {
    let mounted = true;
    setConnected(null); setConnectionError('');
    platform.readSettings().then(async (saved) => {
      const status = saved.provider === 'chrome-local' ? await platform.localModel?.status() : null;
      if (!mounted) return;
      setProvider(saved.provider);
      setModelMessage(status?.message ?? 'Open Settings to prepare local search.');
      setConnected(saved.provider === 'chrome-local' ? status?.state === 'available' : !!saved.apiKey);
    }).catch(() => { if (mounted) setConnectionError('Could not check the search engine. Reopen the extension.'); });
    return () => { mounted = false; };
  }, [settings, settingsRevision, platform]);
  function openSettings() { search.clear(); setSettings(true); }
  return <div className="app-shell">
    {import.meta.env.DEV && <div className="preview-label">Design preview · sample page</div>}
    <header className="app-header"><Brand /><Button variant="ghost" size="icon" aria-label={settings ? 'Return to search' : 'Open settings'}
      aria-pressed={settings} onClick={() => settings ? setSettings(false) : openSettings()}><Settings2 /></Button></header>
    {settings ? <Settings platform={platform} back={() => setSettings(false)} /> : <>
      <section className="search-section">
        <h1>Find the thought.</h1>
        <form onSubmit={(event) => { event.preventDefault(); search.search(); }}>
          <Field><FieldLabel className="sr-only" htmlFor="query">What are you looking for?</FieldLabel>
            <div className="search-line"><Search size={19} aria-hidden="true" />
              <Input id="query" value={search.query} onChange={(event) => search.setQuery(event.target.value)}
                autoFocus placeholder="What are you looking for?" autoComplete="off" disabled={search.busy} />
              {search.busy ? <Button type="button" variant="ghost" size="icon" aria-label="Cancel search" onClick={search.cancel}><Square /></Button>
                : <Button type="submit" size="icon" aria-label="Find matching passages" disabled={!search.query.trim() || connected !== true}><ArrowRight /></Button>}
            </div>
          </Field>
        </form>
        <p className="search-disclosure">{provider === 'chrome-local' ? 'Find processes the page or PDF’s text on this device.' : 'Find sends the page or PDF’s text to TypeSafe.'}</p>
      </section>
      {connectionError && <Alert variant="destructive"><AlertDescription>{connectionError}</AlertDescription></Alert>}
      {search.error && <Alert variant="destructive"><AlertDescription>{search.error}</AlertDescription></Alert>}
      {search.notice && <p className="notice" role="status">{search.notice}</p>}
      {search.accessRequest && <div className="pdf-access"><p>{search.accessRequest.message}</p>
        <Button data-pdf-access onClick={search.allowPDFAccess} disabled={search.busy}>Allow PDF access <ArrowRight data-icon="inline-end" /></Button></div>}
      {search.page && <div className="source-line"><FileText size={15} aria-hidden="true" /><div><strong>{search.page.title || 'Untitled page'}</strong>
        <span>{new URL(search.page.url).hostname || 'Local file'} · {search.page.pdf ? `${search.page.pdf.pageCount} PDF pages · ` : ''}{search.page.passages.length} passages</span></div></div>}
      {!!search.page?.pdf?.emptyPages.length && <p className="notice" role="status">{search.page.pdf.emptyPages.length} PDF {search.page.pdf.emptyPages.length === 1 ? 'page has' : 'pages have'} no extractable text. Images and scans aren’t searched.</p>}
      {search.busy && <div className="search-progress" role="status"><LoaderCircle className="spin" size={18} />
        <span>{search.page ? `Searching ${search.progress} of ${search.page.passages.length} passages…` : search.captureProgress}</span></div>}
      {search.result && <Results key={search.result.page.id} result={search.result} active={search.active}
        select={search.select} clear={search.clear} platform={platform} />}
      {!search.busy && !search.result && !search.accessRequest && <Empty className="welcome-state"><EmptyHeader>
        <div className="reading-mark" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <EmptyTitle>{connected === false ? provider === 'chrome-local' ? 'Prepare local search.' : 'Make the connection.' : 'A little less searching.'}</EmptyTitle>
        <EmptyDescription>{connected === false ? provider === 'chrome-local' ? modelMessage : platform.localModel ? 'Choose Chrome’s local model or connect your TypeSafe account.' : 'Add your TypeSafe API key to find ideas in the page you’re reading.' : 'Ask a question or describe an idea. Jump to the original words, then take the passages with you.'}</EmptyDescription>
      </EmptyHeader>{connected === false && <Button onClick={openSettings}>{platform.localModel ? 'Choose search engine' : 'Connect TypeSafe'} <ArrowRight data-icon="inline-end" /></Button>}
      {connected === true && <div className="example-searches"><span>Try a question</span>
        {['What are the extra costs?', 'What happens if I cancel?'].map((query) => <Button key={query} variant="ghost" onClick={() => { search.setQuery(query); document.getElementById('query')?.focus(); }}>{query}<ArrowRight data-icon="inline-end" /></Button>)}
      </div>}</Empty>}
      {!search.result?.matches.length && <footer className="app-footer"><span className="connection-dot" data-connected={connected} />{provider === 'chrome-local' ? connected ? 'Local model ready' : 'Local setup needed' : connected ? 'TypeSafe connected' : 'Your key. Your searches.'}<span>{provider === 'chrome-local' ? 'Gemini Nano' : 'Jev'}</span></footer>}
    </>}
  </div>;
}
