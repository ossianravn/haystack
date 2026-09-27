import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

async function start() {
  const { platform } = import.meta.env.DEV ? await import('../dev/platform') : await import('../extension/platform');
  createRoot(document.getElementById('root')!).render(<App platform={platform} />);
}
start().catch(() => { document.getElementById('root')!.textContent = 'Haystack could not start. Reload the extension and try again.'; });
