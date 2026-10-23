# Haystack guide

Everything the [README](../README.md) leaves out: searching, exports, Chrome local search, PDFs, data handling, page coverage and troubleshooting.

## Search and export

- Click the toolbar icon, or press **Ctrl+Shift+Y** (**Command+Shift+Y** on macOS). This leaves the browser's normal Find shortcut available.
- Type a question or idea and press **Enter** or the arrow button. Searches run only when submitted.
- Click a result or the previous/next arrows to move to its source. Pale straw shows the passage; richer hay tones mark its key sentence. The active sentence is underlined.
- **Copy all** copies every matching passage as Markdown. **Save .md** opens the browser's save dialog. Both include the page title, URL, search, and full passages in original page order. Individual result copy buttons copy one full passage.
- Jev's default match threshold is 58%. Adjust it in Settings and choose **Connect & save**. Lower values include looser connections; higher values keep stronger matches. Scores estimate relevance; they do not guarantee recall or correctness. The saved threshold applies to the next search. Chrome local has no numerical threshold.
- Cancel a running search with **Cancel**. Clear removes results and highlights. Editing the query, changing tabs, navigating to another document, or closing the panel clears the previous search. Opening a matching PDF page preserves the results.

## Chrome local search (experimental)

Open **Settings → Chrome local → Set up & use local model**. If Chrome has already prepared the model, the button says **Use local model**. Keep Settings open during preparation; progress is shown while Chrome downloads the model. A small local inference check runs before the selection is saved. Then return to search. No API key is required for local searches, and your existing Jev key and threshold remain saved when switching engines.

Local search has three stages: Nano expands your query into search keywords; Haystack retrieves likely passages locally using the original query and those keywords; Nano checks each candidate and extracts a supporting quotation. Quotations must map back to the original source, allowing only whitespace differences such as PDF line breaks. Generated paraphrases are never displayed as source text. Progress distinguishes model startup, query interpretation, and candidate checking.

This candidate approach reduces model work but can miss relevant passages that use vocabulary the retrieval step does not find. Every retrieved candidate is checked, with no top-N match or export cutoff. Inputs exceeding the model's measured context are split while preserving original offsets. Results stay in source order and say **Matched locally**. They do not display Jev-style percentages or use its threshold. Webpage highlights, PDF page links, **Copy all**, and **Save .md** work with either engine.

If the model is unavailable, setup explains the condition. Local search never falls back to TypeSafe automatically. Cancel stops inference and releases the search sessions. Closing the panel or changing pages cancels the active search. Firefox continues to offer Jev only.

Chrome's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) is available to eligible desktop extensions from Chrome 138; actual availability depends on the browser, model, device and storage. Haystack checks the API at runtime, so older Chrome users can keep using Jev. See [Chrome's model requirements](https://developer.chrome.com/docs/ai/get-started#hardware). Danish is passed directly without translation; its search quality is experimental. Long PDFs may take substantial local compute time.

Native inference was exercised in normal Chrome 153 on 2026-09-27, using the production search code and captured Danish Wolt terms, an unrelated Danish query, and an English cancellation example. This establishes actual Danish retrieval capability; it does not establish perfect precision or recall. Broad matches and model startup latency remain limitations. See the [native evaluation report](nano-retrieval-evaluation.md) for observations and reproduction steps. Separate real-browser UI tests use a controlled model to check setup, persistence, highlights, cancellation, clipboard/download, and absence of TypeSafe requests.

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

Haystack reads rendered text in the current page's top-level document and splits long text instead of discarding it. Jev evaluates every captured passage in batches of eight. Chrome local retrieves candidates across the captured text, then evaluates those candidates individually. There is no fixed top-N match or export limit. Longer pages can take more processing time and, with Jev, more API requests.

Browser settings, extension stores, scanned text, iframe contents, closed/open shadow-root contents, collapsed hidden sections, and text that a site has not loaded are not searched. On virtualized webpages, only text currently present and rendered in the document is available. PDFs use the separate document reader described above. File URLs require the browser's normal extension file-access setting.

When scrolling replaces table or list rows, Haystack relocates captured matches using their original row context and scroll position. Repeated text stays associated with its source row. Result jumps are immediate, and highlights refresh after the page updates. This does not expand the search to rows that were never loaded at capture time.

If a selected passage's text changes or its original location cannot be recovered, Haystack asks you to search again. Other valid matches remain navigable. Captured excerpts can still be exported while that page remains active. This is source retrieval, not generated answers.

## How it works

1. **Capture:** a content script reads the current webpage into passages with stable identifiers and nearby headings. PDF.js instead reads a PDF's text layer and attaches physical page numbers.
2. **Evaluate:** Jev returns relevance estimates and sentence choices for all captured passages. Chrome local expands the query, retrieves candidates, and asks for a source quotation or a non-match for each candidate. Query expansion and extraction use separate model sessions with task-specific instructions. Source content is treated as data, not as instructions.
3. **Map back:** Haystack validates responses and maps sentence choices or quotations to the original text offsets. It rejects local quotations that cannot be found in the source. Webpage highlights use the CSS Custom Highlight API without wrapping or rewriting page text; PDF results navigate to native viewer page links.
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
