import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SearchProvider } from '../core/types';
import type { Platform } from './platform';
import { TypeSafeSettings } from './TypeSafeSettings';
import { LocalSettings } from './LocalSettings';

export function Settings({ platform, back }: { platform: Platform; back: () => void }) {
  const [provider, setProvider] = useState<SearchProvider | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    platform.readSettings().then((saved) => { if (mounted) setProvider(saved.provider); })
      .catch(() => { if (mounted) setError('Could not read settings. Reopen the extension.'); });
    return () => { mounted = false; };
  }, [platform]);
  return <main className="settings-view">
    <Button variant="ghost" onClick={back}><ArrowLeft data-icon="inline-start" />Back to search</Button>
    <div className="settings-heading"><h1>{platform.localModel ? 'Your search engine.' : 'Your connection.'}</h1></div>
    {platform.localModel && provider && <FieldGroup className="engine-choice"><Field>
      <FieldLabel id="engine-label">Search engine</FieldLabel>
      <ToggleGroup aria-labelledby="engine-label" value={[provider]} onValueChange={(values) => {
        if (values[0] === 'typesafe' || values[0] === 'chrome-local') setProvider(values[0]);
      }}>
        <ToggleGroupItem value="typesafe">TypeSafe · Jev</ToggleGroupItem>
        <ToggleGroupItem value="chrome-local">Chrome local</ToggleGroupItem>
      </ToggleGroup>
    </Field></FieldGroup>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {provider === 'typesafe' && <TypeSafeSettings platform={platform} />}
    {provider === 'chrome-local' && platform.localModel && <LocalSettings platform={platform} model={platform.localModel} />}
  </main>;
}
