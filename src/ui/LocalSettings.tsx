import { useEffect, useRef, useState } from 'react';
import { Check, Download, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { LocalModel } from '../local/model';
import type { Platform } from './platform';

export function LocalSettings({ platform, model }: { platform: Platform; model: LocalModel }) {
  const [status, setStatus] = useState<Awaited<ReturnType<LocalModel['status']>> | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'saving'>('idle');
  const busy = phase !== 'idle';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    model.status().then((value) => { if (mounted) setStatus(value); })
      .catch(() => { if (mounted) setError('Could not check Chrome’s local model. Reopen Settings to try again.'); });
    return () => { mounted = false; request.current?.abort(); };
  }, [model]);

  async function prepare() {
    const controller = new AbortController();
    request.current = controller;
    setPhase('preparing'); setError(''); setMessage('Preparing Gemini Nano…');
    try {
      // This call starts model creation synchronously inside the click gesture.
      await model.prepare(controller.signal, setMessage);
      controller.signal.throwIfAborted();
      setPhase('saving');
      const settings = await platform.readSettings();
      controller.signal.throwIfAborted();
      await platform.saveSettings({ ...settings, provider: 'chrome-local' });
      if (!controller.signal.aborted) {
        setStatus({ state: 'available', message: 'Gemini Nano is ready.' });
        setMessage('Chrome local selected. Settings saved.');
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setMessage('');
        setError(cause instanceof Error ? cause.message : 'Could not prepare the local model. Try again.');
      }
    } finally { if (request.current === controller) { request.current = null; setPhase('idle'); } }
  }

  return <>
    <section className="local-model" aria-labelledby="local-title">
      <div className="local-model-heading"><h2 id="local-title">Gemini Nano</h2><span>Experimental</span></div>
      <p>{status?.message ?? 'Checking Chrome’s local model…'}</p>
      <div className="settings-actions">
        <Button onClick={prepare} disabled={busy || !status || status.state === 'unavailable'}>
          {busy ? <LoaderCircle className="spin" data-icon="inline-start" /> : status?.state === 'available' ? <Check data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          {busy ? phase === 'saving' ? 'Saving…' : 'Preparing…' : status?.state === 'available' ? 'Use local model' : 'Set up & use local model'}
        </Button>
        {phase === 'preparing' && <Button variant="ghost" onClick={() => {
          request.current?.abort(); request.current = null; setPhase('idle'); setMessage('Setup cancelled. Your search engine was not changed.');
        }}>Cancel</Button>}
      </div>
      <p role="status" className="saved-message">{message}</p>
    </section>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <section className="privacy"><h2>Search on this device</h2>
      <p>The page or PDF’s text and your query are processed locally in Chrome. No API key or TypeSafe credits are needed.</p>
      <p>Chrome may download the model during setup. Local searches never switch to a cloud provider automatically.</p>
      <p>Matches keep the original wording and source order. Danish and other languages beyond Chrome’s documented support are experimental.</p>
      <a className="text-link" href="https://developer.chrome.com/docs/ai/get-started#hardware" target="_blank" rel="noreferrer">Chrome model requirements</a>
    </section>
  </>;
}
