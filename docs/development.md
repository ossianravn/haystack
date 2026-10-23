# Developing Haystack

Build with the commands in the [README](../README.md#install).

## Build output

`npm run build` creates both browser versions:

| Output | Purpose |
| --- | --- |
| `dist/chrome/` | Unpacked Chrome extension |
| `dist/firefox/` | Unpacked Firefox extension |
| `artifacts/haystack-chrome-1.2.0.zip` | Packaged Chrome build |
| `artifacts/haystack-firefox-1.2.0.zip` | Packaged Firefox build |

No `.env` or API key is needed to build. Users enter their own key in the installed extension, or choose Chrome local. Once built, the extension runs independently of Node.js and the development server. Keep its unpacked directory in place while it is installed.

## Checks

The project uses React, TypeScript, Vite, Tailwind CSS, shadcn/Base UI, and Manifest V3. Use Node.js 24 LTS and the dependencies locked in `package-lock.json`. After building, the baseline checks are:

```sh
npm run check
npm test
```

`npm run build` creates both unpacked extensions and ZIPs from an explicit extension output directory. `.env`, reference files, tests, and development previews are excluded. Every hand-maintained code file stays below 300 physical lines.

`npm run dev` opens a UI development server. Visit `/panel.html` at the URL Vite prints. This is a clearly labeled design preview using sample data and an in-memory test key; it does not call TypeSafe. Production builds exclude the preview module. Preview keys are discarded on reload.

## Live TypeSafe checks

Create a local `.env` file using [`.env.example`](../.env.example) as the template and set `TYPESAFE_API_KEY` to your own key, then run:

```sh
npm run test:live
```

This makes real, billable TypeSafe requests to verify relevant and unrelated passages plus exact source-sentence mapping. `.env` is ignored by Git and never loaded by the extension build. The extension selects `jev-latest` and records the returned model identifier in exports. The development key is not automatically installed into your browser: enter a key in the extension's Settings separately.

## Browser checks

Run `npm run build` before browser tests, and rebuild after source changes. Install the Playwright browser with `npx playwright install chromium`; Firefox checks need Firefox installed and download Geckodriver on first use.

These checks do **not** make billable AI requests:

```sh
npm run test:browser
npm run test:local
node scripts/cancel-browser-test.mjs
npm run test:local -- --live
node scripts/firefox-provider-test.mjs
npm run test:navigation
npm run test:navigation -- --firefox
npm run test:navigation -- --live
npm run test:pdf
```

These additional checks require `.env` and **make real TypeSafe requests**:

```sh
npm run test:firefox
npm run test:pdf:firefox
npm run test:pdf:live
```

`npm run lint:firefox` checks the packaged Firefox extension. Its known nonzero result is described below.

The Chromium check uses mocked TypeSafe responses and real extension APIs. It covers key settings, capture exclusions, highlights, navigation, stale source detection, clipboard text, downloaded Markdown, and narrow layout. Set `HAYSTACK_CHROMIUM` to a Chrome for Testing executable if the default Playwright installation is unavailable.

The local check uses a controlled `LanguageModel` double and the actual extension UI. `--live` instead checks native model availability and runs the fixture only if the model is already available; it does not download a model automatically. An unavailable result is reported as unverified inference, not a passing model benchmark. The Firefox provider check confirms that Chrome-only settings do not enable a local engine or replace Jev's settings in Firefox. It makes no AI requests.

The navigation check exercises the packaged content script in a real browser against a virtual table. It covers repeated jumps, restoring removed rows, duplicate text, rapid clicks, replacement text nodes, and genuine text edits. `--firefox` uses Firefox; `--live` uses the US500 Fortune 1000 table that reproduced the bug. These checks supply matches directly and do not call TypeSafe. Isolated test copies receive access to the test website; release permissions are unchanged.

The Firefox check requires installed Firefox and `.env`; it makes real TypeSafe requests and tests MV3 loading, capture, highlights, and a Markdown download. Geckodriver downloads on first use. Both browser tests use isolated profiles and **test copies** of the packages with localhost fixture access, and suppress the native save dialog. Release manifests retain `activeTab`. Native toolbar permission prompts and Save As dialogs still need a manual release check.

The PDF checks install the release packages without adding test host permissions. Chrome exercises its toolbar action through CDP; Firefox uses the actual toolbar and website permission dialog. Both check native viewer page navigation and exports. The test panel runs in a tab: Firefox's permission prompt is accepted there, then the PDF search is submitted again. The native sidebar's automatic continuation after permission approval remains a manual UI check. The fixture includes two text pages and one empty page; Chrome also checks cancellation during the PDF download. `test:pdf:live` searches the complete 148-page DBU 2025/2026 rulebook for “offside” using `.env`; it consumes TypeSafe credits. PDF extraction is real in every PDF check; only the default Chrome fixture's TypeSafe responses are mocked.

Firefox's strict linter reports six dependency warnings and zero errors: two React DOM HTML-assignment warnings, plus two dynamic-import and two Function-constructor warnings in PDF.js's legacy build. The Function calls are upstream global-object polyfill fallbacks; modern browsers have `globalThis`, and the extension CSP does not allow eval. The PDF worker is packaged locally and no remote scripts are loaded. Haystack never calls `dangerouslySetInnerHTML` or inserts source text as HTML. These warnings remain visible; `lint:firefox` uses `--warnings-as-errors` and exits nonzero pending review for store submission.

## Architecture and references

- `src/core`: direct TypeSafe HTTP contract, sentence offsets, batching, matching, Markdown.
- `src/local`: Chrome model setup, query expansion, candidate retrieval, quotation extraction, and original-source mapping.
- `src/extension`: platform background entry, page capture/highlights, trusted settings and browser adapters.
- `src/ui`: shared React sidebar/options UI; shadcn/Base UI controls, warm paper and hay palette, flat excerpt rows.
- `scripts`: platform manifests, packaging, live and browser checks.
- `tests`: contract fixtures and unit tests; browser integration scripts live in `scripts`.
- `docs`: [Chrome local search investigation and design rationale](chrome-local-search-investigation.md).

Standards reviewed on September 25, 2026: [Chrome MV3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3), [Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Firefox background environments](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Firefox sidebar](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction/open), and [TypeSafe's current API](https://docs.typesafe.ai/api). Highlighting uses the CSS Custom Highlight API without wrapping or rewriting page text.
