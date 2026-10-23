import { useEffect, useRef, useState } from 'react';
import { PDFSiteAccessRequired, type PageSnapshot, type SearchResult } from '../core/types';
import type { Platform } from './platform';

export function useSearch(platform: Platform) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [page, setPage] = useState<PageSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchProgress, setSearchProgress] = useState('');
  const [captureProgress, setCaptureProgress] = useState('Reading the page…');
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accessRequest, setAccessRequest] = useState<PDFSiteAccessRequired | null>(null);
  const controller = useRef<AbortController | null>(null);
  const selection = useRef(0);

  function reset(message = '') {
    selection.current++;
    controller.current?.abort();
    controller.current = null;
    platform.reset();
    setResult(null);
    setPage(null);
    setBusy(false);
    setError('');
    setNotice(message);
    setAccessRequest(null);
  }

  useEffect(() => platform.subscribePageChange(() => reset('Page changed. Search this page when you’re ready.')), [platform]);
  useEffect(() => () => { controller.current?.abort(); platform.reset(); }, [platform]);

  async function search() {
    if (!query.trim()) return;
    reset();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setProgress(0);
    setSearchProgress('');
    setCaptureProgress('Reading the page…');
    setActive(0);
    try {
      const settings = await platform.readSettings();
      current.signal.throwIfAborted();
      if (settings.provider === 'typesafe' && !settings.apiKey) throw new Error('Add your TypeSafe API key in Settings to search.');
      const captured = await platform.capture(current.signal,
        (message) => { if (!current.signal.aborted) setCaptureProgress(message); });
      current.signal.throwIfAborted();
      setPage(captured);
      const found = await platform.search(captured, query.trim(), settings, current.signal,
        (count, message) => {
          if (!current.signal.aborted) { setProgress(count); setSearchProgress(message ?? ''); }
        });
      current.signal.throwIfAborted();
      setResult(found);
      await platform.highlight(found, 0, false);
    } catch (cause) {
      if (!current.signal.aborted) {
        if (cause instanceof PDFSiteAccessRequired) setAccessRequest(cause);
        else setError(cause instanceof Error ? cause.message : 'Search failed. Try again.');
      }
    } finally {
      if (controller.current === current) setBusy(false);
    }
  }

  async function allowPDFAccess() {
    if (!accessRequest) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setCaptureProgress('Waiting for website access…');
    setError('');
    try {
      // Invoke directly from the button's gesture, before any awaited operation.
      const allowed = await platform.requestPDFAccess(accessRequest.origin);
      if (current.signal.aborted) return;
      if (allowed) await search();
      else setNotice('Access wasn’t granted. Allow PDF access to search this document.');
    } catch {
      if (!current.signal.aborted) setError('Could not request website access. Click Allow PDF access to try again.');
    } finally {
      if (controller.current === current) setBusy(false);
    }
  }

  async function select(index: number) {
    if (!result?.matches.length) return;
    const current = ++selection.current;
    const next = (index + result.matches.length) % result.matches.length;
    setActive(next);
    setError('');
    try { await platform.highlight(result, next, true); }
    catch (cause) {
      if (selection.current === current) setError(cause instanceof Error ? cause.message : 'Could not locate this passage.');
    }
  }

  const editQuery = (value: string) => {
    setQuery(value);
    if (result) reset();
  };
  return { query, setQuery: editQuery, result, page, busy, progress, searchProgress, captureProgress, active, error, notice, accessRequest, allowPDFAccess, search, select,
    cancel: () => reset('Search cancelled.'), clear: () => reset() };
}
