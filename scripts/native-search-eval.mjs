import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const [source, ...queries] = process.argv.slice(2);
if (!source || !queries.length) throw new Error('Usage: node scripts/native-search-eval.mjs <public URL or snapshot.json> <query> [query…]');
let snapshot;
if (/^https?:\/\//.test(source)) {
  const browser = await chromium.launch({ executablePath: process.env.HAYSTACK_CHROMIUM || undefined });
  try {
    const page = await browser.newPage();
    await page.goto(source, { waitUntil: 'networkidle' });
    const capture = (await build({ entryPoints: ['src/extension/capture.ts'], bundle: true,
      format: 'iife', globalName: 'HaystackCapture', write: false })).outputFiles[0].text;
    snapshot = await page.evaluate(`${capture}\nHaystackCapture.capturePage().page`);
  } finally { await browser.close(); }
} else snapshot = JSON.parse(await readFile(source, 'utf8'));
await mkdir('test-results', { recursive: true });
await writeFile('test-results/native-search-snapshot.json', JSON.stringify(snapshot, null, 2));
const script = (await build({ entryPoints: ['scripts/native-search-client.ts'], bundle: true,
  format: 'esm', write: false })).outputFiles[0].text;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Haystack native search evaluation</title>
<h1>Haystack native search evaluation</h1><p>Uses the real Chrome model and Haystack’s production search code. No TypeSafe requests.</p>
<p role="status">Checking model…</p><button id="run" disabled>Run native evaluation</button> <button id="stop">Cancel</button>
<pre></pre><script type="module" src="/client.js"></script></html>`;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/record' && request.method === 'POST' && request.headers['content-type'] === 'application/json') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      await writeFile('test-results/native-search-results.json', Buffer.concat(chunks));
      response.end('Saved');
    } else if (request.url === '/config') {
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ snapshot, queries }));
    } else if (request.url === '/client.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(script);
    } else if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    } else { response.writeHead(404); response.end('Not found'); }
  } catch (error) { console.error(error); response.writeHead(500); response.end('Evaluation server failed; see terminal.'); }
});
server.listen(9466, '127.0.0.1', () => console.log(`Open http://127.0.0.1:9466 in Chrome with an available model. ${snapshot.passages.length} passages; ${queries.length} queries. Ctrl+C stops the server.`));
