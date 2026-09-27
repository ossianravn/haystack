import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Eye, EyeOff, LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DEFAULT_THRESHOLD } from '../core/types';
import type { Platform } from './platform';

export function TypeSafeSettings({ platform }: { platform: Platform }) {
  const [key, setKey] = useState('');
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    platform.readSettings().then((saved) => {
      if (mounted) { setKey(saved.apiKey); setThreshold(saved.threshold); setLoaded(true); }
    }).catch(() => { if (mounted) setError('Could not read settings. Reopen the extension.'); });
    return () => { mounted = false; request.current?.abort(); };
  }, [platform]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage(''); setBusy(true);
    const current = new AbortController();
    request.current = current;
    try {
      await platform.verifyKey(key.trim(), current.signal);
      current.signal.throwIfAborted();
      await platform.saveSettings({ provider: 'typesafe', apiKey: key.trim(), threshold });
      setMessage('Connected to TypeSafe. Settings saved.');
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not save settings.');
    } finally { if (!current.signal.aborted) setBusy(false); }
  }

  async function forget() {
    setError(''); setMessage('');
    try { await platform.removeKey(); setKey(''); setMessage('API key removed from this browser.'); }
    catch { setError('Could not remove the key. Try again.'); }
  }

  return <>
    <form onSubmit={save}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="api-key">TypeSafe API key</FieldLabel>
          <div className="key-field"><Input id="api-key" type={show ? 'text' : 'password'} value={key}
            onChange={(event) => { setKey(event.target.value); setMessage(''); }} autoComplete="off" spellCheck={false}
            placeholder="Paste your API key" required disabled={!loaded || busy} aria-describedby="key-description" />
            <Button type="button" variant="ghost" size="icon" aria-label={show ? 'Hide API key' : 'Show API key'}
              aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button>
          </div>
          <FieldDescription id="key-description">Stored in this browser’s extension storage. Never synced or shared with the webpage.</FieldDescription>
          <a className="text-link" href="https://typesafe.ai" target="_blank" rel="noreferrer">Get a TypeSafe key <ArrowUpRight size={14} /></a>
        </Field>
        <Field>
          <div className="threshold-label"><FieldLabel htmlFor="threshold">Match threshold</FieldLabel><output htmlFor="threshold">{Math.round(threshold * 100)}%</output></div>
          <input id="threshold" type="range" min="0" max="100" step="1" value={Math.round(threshold * 100)}
            onChange={(event) => { setThreshold(Number(event.target.value) / 100); setMessage(''); }} disabled={!loaded || busy} />
          <FieldDescription>Lower includes looser connections. Higher keeps stronger matches. This is a relevance estimate, not a guarantee.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="settings-actions"><Button type="submit" disabled={!loaded || busy || !key.trim()}>
        {busy ? <LoaderCircle className="spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
        {busy ? 'Connecting…' : 'Connect & save'}</Button>
        <Button type="button" variant="ghost" size="icon" title="Remove saved key" aria-label="Remove saved key"
          disabled={!loaded || busy || !key} onClick={forget}><Trash2 /></Button></div>
    </form>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <p role="status" className="saved-message">{message}</p>
    <section className="privacy"><h2>What leaves your browser</h2>
      <p>When you press Find, the page’s readable text and your search go directly to TypeSafe. Your API key authenticates the request.</p>
      <p>No Haystack server, analytics, or saved search history. Results stay in this panel until you clear them, change pages, or close it.</p>
      <p>Connecting sends a small test sentence to verify your key. TypeSafe usage is billed to your account.</p>
      <a className="text-link" href="https://docs.typesafe.ai/legal" target="_blank" rel="noreferrer">TypeSafe data policies <ArrowUpRight size={14} /></a>
    </section>
  </>;
}
