import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { navigationBrowser } from './navigation-browser.mjs';

const live = process.argv.includes('--live');
const fixture = await readFile('tests/virtual-table.html');
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(fixture); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = live ? 'https://us500.com/fortune-1000-companies' : `http://127.0.0.1:${server.address().port}/`;
const name = process.argv.includes('--firefox') ? 'firefox' : 'chrome';
let browser;
try {
  browser = await navigationBrowser(name, url);
  const { captured } = browser;
  assert.equal(captured.ok, true);
  const rows = await browser.evaluate(() => Array.from(document.querySelectorAll('tbody tr'), (row) => row.textContent));
  const industries = await browser.evaluate(() => Array.from(document.querySelectorAll('tbody tr td:nth-child(3)'), (cell) => cell.textContent));
  const matches = captured.page.passages.filter((p) => industries.includes(p.text)).map((p) => ({
    ...p, probability: .95, focus: { start: 0, end: p.text.length, text: p.text },
  }));
  assert.ok(matches.length >= 2);
  const command = (match) => ({
    type: 'highlight', snapshotId: captured.page.id, matches, activeId: match.id, scroll: true,
  });
  const jump = async (match) => (await browser.send([command(match)]))[0];
  assert.equal((await jump(matches.at(-1))).ok, true, 'First result click');
  assert.notEqual(await browser.evaluate(() => document.querySelector('tbody tr')?.textContent), rows[0]);
  const second = await jump(matches[0]);
  console.log(JSON.stringify({ passages: captured.page.passages.length, matches: matches.length, second }));
  assert.equal(second.ok, true, `Second result click: ${second.error}`);
  const activeRow = () => browser.evaluate(() => {
    const range = [...CSS.highlights.get('haystack-active')][0];
    const row = range.startContainer.parentElement.closest('tr');
    const rect = range.getBoundingClientRect();
    return { text: row.textContent, visible: rect.top >= 0 && rect.bottom <= innerHeight };
  });
  assert.deepEqual(await activeRow(), { text: rows[0], visible: true });
  for (const index of [matches.length - 1, matches.length - 2, 1, 0]) {
    assert.equal((await jump(matches[index])).ok, true, `Repeated jump to result ${index + 1}`);
    assert.deepEqual(await activeRow(), { text: rows[index], visible: true });
  }
  await browser.send([command(matches.at(-1)), command(matches[0])]);
  assert.deepEqual(await activeRow(), { text: rows[0], visible: true }, 'Latest click must win');
  if (!live) {
    // A normal framework redraw preserves the match even when every text node is new.
    await browser.evaluate(() => { const body = document.querySelector('tbody'); body.innerHTML = body.innerHTML; });
    assert.equal((await jump(matches[0])).ok, true);
    await browser.evaluate(() => { document.querySelector('tr[data-index="0"] td:nth-child(3)').textContent = 'Changed industry'; });
    assert.equal((await jump(matches[0])).ok, false, 'An edited passage must not jump to a duplicate in another row');
    assert.equal((await jump(matches[1])).ok, true, 'An unrelated edit must not invalidate this result');
    assert.deepEqual(await activeRow(), { text: rows[1], visible: true });
  }
  console.log(JSON.stringify({ passed: true, browser: name, source: live ? 'us500.com' : 'virtual table fixture',
    checks: ['repeat navigation', 'off-screen row restoration', 'duplicate text identity', 'latest selection',
      ...(!live ? ['replaced text nodes', 'edited passage', 'unrelated edits'] : [])] }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
