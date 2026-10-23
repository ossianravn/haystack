# Native Nano retrieval evaluation — 2026-09-27

The original implementation had a real retrieval failure, not evidence that Nano cannot understand Danish. A native reproduction of its required ID/sentence-number classification accepted all eight passages in a small mixed set, including navigation and account material. The user's full-page report showed 164 matches from 172 captured passages and 121.3 seconds. UI tests with a model double had not established relevance quality.

## Implementation now used

1. Expand the original query into a short keyword line, using the source language when available.
2. Search the captured text locally using the original query and expanded words. Ignore common English/Danish function words, support word-prefix inflections, and prioritize rarer matching terms. There is no top-N candidate or export cutoff.
3. Check each candidate in a separate clone of a model session with extraction-specific instructions. The response must be a source sentence or `null`. The JSON constraint enumerates the actual sentences, with standalone legal section numbers joined to the following sentence.
4. Map the returned quotation back to original offsets. Reject non-source quotations; normalize only whitespace to accommodate PDF line breaks. Export the full original passage and retain its page reference.

The expansion and verification stages use separate base sessions. Every base and clone is destroyed after its stage or cancellation. Large candidates are split only when measured/actual model context requires it. Context-overflow events invalidate a response rather than accepting an answer after Chrome discarded input. Progress reports startup, interpretation and candidate checks separately.

## Actual model results

These calls used the native `LanguageModel` in normal desktop Chrome 153 on Windows, without a model double or TypeSafe calls. A local evaluation page imported the production search implementation. Source text was captured with Haystack's real webpage extractor from [Wolt's Danish terms](https://explore.wolt.com/da/dnk/terms). The final fresh capture contained 180 passages and reported language `da-DK`; cookie/navigation state explains why its count differs from the user's screenshot and earlier 176-passage captures.

| Scenario | Observed result | Total time |
| --- | --- | --- |
| Fresh capture, `kold mad`, run 1 | One candidate and one match: the actual food-temperature clause, section 8.6 | 28.8 s |
| Same capture and query, run 2 | Same candidate and same source sentence | 12.2 s |
| Unrelated query, `cykelhjelmens størrelse`, run 1 | One candidate; no matches | 3.3 s |
| Same unrelated query, run 2 | Three candidates; all rejected | 4.1 s |
| English cancellation fixture | Both the direct refund rule and the cancellation exception; no breakfast/account matches | 25.5 s |

The first Danish run spent 20.3 seconds starting the model, followed by approximately 8.5 seconds interpreting and checking. Startup in the repeat took 7.6 seconds. These are individual device observations, not a latency guarantee or a controlled speedup comparison against the user's earlier run.

**Recall is deliberately different.** The final Danish runs found the direct temperature clause but did not retrieve the more general complaints/refund clause. Candidate selection can miss useful passages without matching vocabulary. Keyword expansion also varied between runs, as the negative-query candidate counts show. Two successful runs do not establish broad accuracy across documents or languages.

Earlier variants still accepted broad food-related clauses; asking for unrestricted quotations also produced a paraphrase that failed source grounding. The final source-sentence constraint fixes quotation integrity, but it cannot guarantee semantic relevance. The provider remains experimental.

## Reproduce native inference

With dependencies installed and a Playwright browser available:

```powershell
node scripts/native-search-eval.mjs "https://explore.wolt.com/da/dnk/terms" "kold mad" "cykelhjelmens størrelse"
```

Open `http://127.0.0.1:9466` in your normal Chrome profile with an available Nano model, then click **Run native evaluation**. The server captures the public page in an isolated browser; inference runs in the normal profile's actual model. Set `HAYSTACK_CHROMIUM` to a browser executable if required. Alternatively, pass a saved `PageSnapshot` JSON file instead of a URL.

To run the English control after stopping the first server with Ctrl+C:

```powershell
node scripts/native-search-eval.mjs tests/native-english.json "What happens if my train is cancelled?"
```

The visible report and `test-results/native-search-results.json` contain timings, stages, original matches and source offsets. Test artifacts are ignored by Git. Review the actual selected passages; a completed invocation alone is not a relevance pass. The harness does not install/download Nano or call a cloud provider.

## Other verification and limits

Unit/contract checks cover candidate preservation, no top-N cutoff, split-source offsets, quotation grounding, PDF whitespace, legal section numbers, session cleanup and cancellation. Extension UI checks use a controlled model and exercise setup, provider persistence, real highlighting, clipboard/download, narrow layout and Cancel via mouse/Enter/Space. These checks validate mechanics, not native inference quality.

The browser automation connection disallowed navigation to an internal `chrome-extension://` test page. Native inference was therefore tested on a localhost page with the production modules; extension UI integration was tested separately in an isolated profile with a model double. Extension-only sampling settings were not tested. Native local-search quality on the complete DBU PDF remains unmeasured in this revision.
