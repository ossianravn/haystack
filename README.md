# Haystack

A Chrome and Firefox extension for finding ideas in the page you are reading. Describe what you need, jump to the original passages, and copy or save every match as Markdown.

Haystack searches with TypeSafe Jev using your own API key, or with Chrome's local Gemini Nano model. Jev remains the default and is the Firefox search engine. Neither option needs a Haystack backend, Vercel account, or running development server.

It retrieves original source text rather than writing an answer. For example, search a travel policy for “What happens if I cancel?” to find relevant conditions even when they use different wording, then export the full matching passages with their source.

| | TypeSafe / Jev | Chrome local / Gemini Nano |
| --- | --- | --- |
| Browsers | Chrome and Firefox | Eligible desktop Chrome installations |
| Setup | Your TypeSafe API key and account credits | Prepare Chrome's model; no API key |
| Processing | Text and query sent directly to TypeSafe | Text and query processed on your device |
| Results | Relevance-ranked; adjustable threshold | Original document order; relevant/not-relevant decisions |
| Status | Default engine | Experimental; native inference quality remains unverified |

## Build and install

You need **Git, Node.js 24 LTS, and npm**. The repository contains source code; unpacked extensions and ZIPs are generated locally and are not committed. Run these commands in a terminal:

```sh
git clone https://github.com/ossianravn/haystack.git
cd haystack
npm ci
npm run build
```

This creates both browser versions:

| Output | Purpose |
| --- | --- |
| `dist/chrome/` | Unpacked Chrome extension |
| `dist/firefox/` | Unpacked Firefox extension |
| `artifacts/haystack-chrome-1.2.0.zip` | Packaged Chrome build |
| `artifacts/haystack-firefox-1.2.0.zip` | Packaged Firefox build |

No `.env` or API key is needed to build. Users enter their own key in the installed extension, or choose Chrome local. Once built, the extension runs independently of Node.js and the development server. Keep its unpacked directory in place while it is installed.

### Chrome

**Chrome (125 or later)**

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and choose this project's `dist/chrome` directory.
3. Pin Haystack, open a webpage, and click its toolbar icon.
4. Choose **Choose search engine**. Connect your TypeSafe key with **Connect & save**, or select **Chrome local** and prepare the local model.

Alternatively, extract the generated Chrome ZIP and choose the extracted directory with **Load unpacked**.

### Firefox

**Firefox (149 or later)**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
3. Open a webpage and click Haystack's toolbar icon. Connect your TypeSafe key in Settings.

Temporary Firefox installations last until the browser restarts. The unsigned package is `artifacts/haystack-firefox-1.2.0.zip`; permanent installation in standard Firefox requires Mozilla signing. These packages have not been submitted to either store. See [Mozilla's distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

### Update an existing installation

Run `git pull` from your clone, then `npm ci` and `npm run build`. In Chrome, click **Reload** on Haystack's extension card; in Firefox, reload the temporary add-on from `about:debugging`. Refresh the webpage and close and reopen Haystack's panel so the page script and panel use the same build.

## Search and export

- Click the toolbar icon, or press **Ctrl+Shift+Y** (**Command+Shift+Y** on macOS). This leaves the browser's normal Find shortcut available.
- Type a question or idea and press **Enter** or the arrow button. Searches run only when submitted.
- Click a result or the previous/next arrows to move to its source. Pale straw shows the passage; richer hay tones mark its key sentence. The active sentence is underlined.
- **Copy all** copies every matching passage as Markdown. **Save .md** opens the browser's save dialog. Both include the page title, URL, search, and full passages in original page order. Individual result copy buttons copy one full passage.
- Jev's default match threshold is 58%. Adjust it in Settings and choose **Connect & save**. Lower values include looser connections; higher values keep stronger matches. Scores estimate relevance; they do not guarantee recall or correctness. The saved threshold applies to the next search. Chrome local has no numerical threshold.
- Cancel a running search with the square button. Clear removes results and highlights. Editing the query, changing tabs, navigating to another document, or closing the panel clears the previous search. Opening a matching PDF page preserves the results.

## Chrome local search (experimental)

Open **Settings → Chrome local → Set up & use local model**. If Chrome has already prepared the model, the button says **Use local model**. Keep Settings open during preparation; progress is shown while Chrome downloads the model. A small local inference check runs before the selection is saved. Then return to search. No API key is required for local searches, and your existing Jev key and threshold remain saved when switching engines.

Local search uses the original captured passages and chooses matching sentence references. Results stay in source order and say **Matched locally**. They do not display Jev-style percentages or use its threshold. Webpage highlights, PDF page links, **Copy all**, and **Save .md** work with either engine. Every captured passage is evaluated; inputs that exceed the model's measured context are split without summarizing or dropping their text.

If the model is unavailable, setup explains the condition. Local search never falls back to TypeSafe automatically. Cancel stops inference and releases the search sessions. Closing the panel or changing pages cancels the active search. Firefox continues to offer Jev only.

Chrome's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) is available to eligible desktop extensions from Chrome 138; actual availability depends on the browser, model, device and storage. Haystack checks the API at runtime, so older Chrome users can keep using Jev. See [Chrome's model requirements](https://developer.chrome.com/docs/ai/get-started#hardware). Danish is passed directly without translation; its search quality is experimental. Long PDFs may take substantial local compute time.

Verification on 2026-09-27: real-browser UI tests with a controlled model verify setup, persistence, keyless search, highlights, cancellation, unavailable state, clipboard/download, and no TypeSafe calls. Installed Chrome 153 exposed `LanguageModel` but reported `unavailable` in its isolated headless profile. Actual Nano inference, speed and Danish retrieval quality remain unverified; that profile's status does not establish readiness in your normal browser profile.

## PDFs

Open the PDF directly in a browser tab, click Haystack, and search as usual. Haystack reads the complete document locally using bundled Mozilla PDF.js, then evaluates its extracted passages with the selected search engine. It keeps the browser's existing viewer. Results show **PDF page N**; clicking a passage opens that physical page. Chrome refreshes the PDF viewer to apply the page link, while the search results remain available.

In Firefox, the first search on a PDF website asks you to **Allow PDF access**. Firefox then requests permission for that website only. Granting it resumes the search. You can revoke website access in Firefox's add-on permissions. Haystack does not request permanent access to every website at installation.

**Copy all**, **Save .md**, and individual passage copies include clickable PDF page references. Page numbers refer to the viewer's page count, which can differ from numbers printed inside a document. Exports keep document order.

PDFs need an extractable text layer. Images and scans are not OCR'd. Pages without extractable text are reported in the panel and export; a document with no text shows an actionable error without sending an AI request. Password-protected PDFs require an unprotected copy. Text order depends on the PDF's text layer, particularly for complex columns and tables. Native PDF viewers do not receive sentence highlights; the selected sentence remains marked in Haystack's result.

Chrome local-file PDFs require **Allow access to file URLs** in the extension details. Firefox currently supports PDFs opened from websites. Embedded PDFs and `blob:` viewers should be opened at their original PDF address in a separate tab.

For Firefox's first permission request, the PDF address or tab title must end in `.pdf`. Download endpoints without an identifiable filename can be read after that website has PDF access, or from a direct `.pdf` link.

## Data and API keys

Keys are stored in extension-local browser storage, never in browser sync. This storage is not a password vault. Chrome restricts it to trusted extension contexts; the page extraction script never reads keys or makes API requests. Keys are sent only as authentication to `https://api.typesafe.ai`.

With Jev selected, submitting a search sends all captured passages, their nearby headings or PDF page references, and the query directly to TypeSafe. With Chrome local selected, those inputs stay on the device for inference. The page URL is included in exports but is not sent in the TypeSafe evaluation payload. PDF files, images, and attachments are not uploaded. PDF downloads use the source website's existing session where the browser permits it. Connecting a TypeSafe key sends a small built-in test sentence. TypeSafe charges your own account for its requests.

Haystack has no analytics or search-history storage. Page snapshots and results live only in panel memory. Input values, editable regions, hidden text, cookies, and browsing history are not captured. Read [TypeSafe's data policies](https://docs.typesafe.ai/legal) for provider-side handling.

The extension requests temporary access to a page through `activeTab`, instead of permanent access to every website. When moving to a new page, click the Haystack toolbar icon if the browser asks you to grant access again. Other permissions provide script injection, local settings, clipboard writing, Markdown downloads, and Chrome's native side panel.

Firefox declares `websiteContent`, `searchTerms`, and `authenticationInfo` under its [built-in data consent system](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Supported page content

Haystack reads rendered text in the current page's top-level document. It splits long text instead of discarding it and evaluates every captured passage. Jev processes batches of eight; Chrome local sizes batches to its measured context capacity. There is no fixed top-N match or export limit. Longer pages take more processing time and, with Jev, more API requests.

Browser settings, extension stores, scanned text, iframe contents, closed/open shadow-root contents, collapsed hidden sections, and text that a site has not loaded are not searched. On virtualized webpages, only text currently present and rendered in the document is available. PDFs use the separate document reader described above. File URLs require the browser's normal extension file-access setting.

When scrolling replaces table or list rows, Haystack relocates captured matches using their original row context and scroll position. Repeated text stays associated with its source row. Result jumps are immediate, and highlights refresh after the page updates. This does not expand the search to rows that were never loaded at capture time.

If a selected passage's text changes or its original location cannot be recovered, Haystack asks you to search again. Other valid matches remain navigable. Captured excerpts can still be exported while that page remains active. This is source retrieval, not generated answers.

## How it works

1. **Capture:** a content script reads the current webpage into passages with stable identifiers and nearby headings. PDF.js instead reads a PDF's text layer and attaches physical page numbers.
2. **Evaluate:** the selected engine receives the query and original passages. Jev returns relevance estimates and sentence choices. Chrome local returns constrained references to relevant source sentences. Source content is treated as data, not as instructions.
3. **Map back:** Haystack validates the response and maps sentence choices to the original text offsets. The model does not write replacement quotations. Webpage highlights use the CSS Custom Highlight API without wrapping or rewriting page text; PDF results navigate to native viewer page links.
4. **Export:** Markdown is assembled from the captured source passages, with the title, URL, query, engine, and PDF references where applicable. Exports contain every match in document order, even when the Jev result list is ranked by relevance.

The extension panel owns the current search and its cancellation. Background code opens the browser panel; page scripts handle capture and highlights. Settings persist in extension-local storage, while documents and search results remain in memory.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| No `dist/chrome` or `dist/firefox` directory | Run `npm ci` and `npm run build` from the repository root first. |
| Haystack cannot access a new page | Click its toolbar icon while that page is active to grant temporary access. Browser internal pages and extension stores cannot be searched. |
| No readable text | Check that text is loaded and visible. Scanned PDFs need OCR outside Haystack; iframe and shadow-root text is not captured. |
| Firefox asks for PDF access | Click **Allow PDF access** and approve that website in Firefox's prompt. Use a direct PDF address if it cannot identify the document. |
| Chrome cannot read a local PDF | Enable **Allow access to file URLs** in Haystack's extension details. |
| Chrome local is unavailable | Check the linked Chrome model requirements and the status in Settings. You can select Jev explicitly; Haystack never switches providers automatically. |
| TypeSafe rejects a key or requests credits | Update the key in Settings or check your TypeSafe account. Connecting the key itself makes a small API request. |
| No matches or unexpected matches | Make the query more specific. With Jev, adjust and save the threshold, then search again. Neither engine guarantees complete or correct retrieval. |
| A result says its source text changed | Search again to capture the current document. Matches refer to the text present when the search began. |
| Changes are missing after a rebuild | Reload the extension, refresh the webpage, and reopen the panel. |

## Development

The project uses React, TypeScript, Vite, Tailwind CSS, shadcn/Base UI, and Manifest V3. Use Node.js 24 LTS and the dependencies locked in `package-lock.json`. After the build-and-install steps above, the baseline checks are:

```sh
npm run check
npm test
```

`npm run build` creates both unpacked extensions and ZIPs from an explicit extension output directory. `.env`, reference files, tests, and development previews are excluded. Every hand-maintained code file stays below 300 physical lines.

`npm run dev` opens a UI development server. Visit `/panel.html` at the URL Vite prints. This is a clearly labeled design preview using sample data and an in-memory test key; it does not call TypeSafe. Production builds exclude the preview module. Preview keys are discarded on reload.

### Live TypeSafe checks

Create a local `.env` file using [`.env.example`](.env.example) as the template and set `TYPESAFE_API_KEY` to your own key, then run:

```sh
npm run test:live
```

This makes real, billable TypeSafe requests to verify relevant and unrelated passages plus exact source-sentence mapping. `.env` is ignored by Git and never loaded by the extension build. The extension selects `jev-latest` and records the returned model identifier in exports. The development key is not automatically installed into your browser: enter a key in the extension's Settings separately.

### Browser checks

Run `npm run build` before browser tests, and rebuild after source changes. Install the Playwright browser with `npx playwright install chromium`; Firefox checks need Firefox installed and download Geckodriver on first use.

These checks do **not** make billable AI requests:

```sh
npm run test:browser
npm run test:local
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
- `src/local`: Chrome model setup, context-aware local classification, and original-sentence mapping.
- `src/extension`: platform background entry, page capture/highlights, trusted settings and browser adapters.
- `src/ui`: shared React sidebar/options UI; shadcn/Base UI controls, warm paper and hay palette, flat excerpt rows.
- `scripts`: platform manifests, packaging, live and browser checks.
- `tests`: contract fixtures and unit tests; browser integration scripts live in `scripts`.
- `docs`: [Chrome local search investigation and design rationale](docs/chrome-local-search-investigation.md).

Standards reviewed on September 25, 2026: [Chrome MV3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3), [Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Firefox background environments](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Firefox sidebar](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction/open), and [TypeSafe's current API](https://docs.typesafe.ai/api). Highlighting uses the CSS Custom Highlight API without wrapping or rewriting page text.

## License and third-party code

No license has been selected for Haystack's own source code. This repository does not currently grant an open-source license to that code.

shadcn component source in `src/components/ui` comes from its official Base Nova registry and is adapted to the Haystack design. Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Builds include dependency license texts in `LICENSES.txt` inside each extension package.
