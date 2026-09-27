# Chrome local search investigation

Investigated 2026-09-27. This document records the proposal before implementation; it is not a live-model benchmark.

Follow-up: the opt-in Chrome provider was implemented in version 1.2.0 after this investigation. See the README's Chrome local search section for current behavior and validation. The proposal below is retained as the design rationale. Native Nano inference remains unverified: the isolated Chrome 153 test profile exposed the API but reported it unavailable.

## Finding

Chrome's built-in Gemini Nano is a plausible alternative search provider. The reference was a separate NoBait project (`klare-overskrifter`), which is not included in this repository. Its source paths below identify the implementation inspected during the investigation; NoBait is not a build or runtime dependency of Haystack.

Haystack already separates document capture, search, navigation, and export. The proposed experiment replaces passage evaluation while retaining the exact captured words and source locations.

## What NoBait establishes

| Inspected source | Reusable behavior |
| --- | --- |
| `src/ai/platform.ts` | Detect `LanguageModel`; check availability; start preparation directly from a click; report download progress; destroy the preparation session |
| `src/ai/generate.ts` | Create a session with system instructions; propagate cancellation; release resources in `finally` |
| `src/ai/context.ts` | Constrain JSON output; validate it; measure context; clone a base session for independent requests; destroy each clone |
| `src/runtime/index.ts` and `profile-test.ts` | Serialize model work and perform a real generation probe rather than equating API presence with working inference |
| `docs/VERIFICATION.md` | Separate mocked contracts, live publisher extraction, and actual model evidence |

The verification record reports `model:needs-setup` or preparing in the automated browser. It explicitly leaves real Danish generation quality unverified. Existing tests use model doubles. This does not establish whether the user's normal Chrome profile is already ready.

NoBait also summarizes oversized articles into notes before headline generation. Do not carry that reduction into Haystack: a summary can omit the exact sentence someone wants to find. Evaluate original passages in context-sized batches, including all captured passages.

## Current platform facts

- Chrome documents Prompt API availability for extensions from version 138, versus 148 for ordinary websites. It supports constrained JSON and cancellation. It is not exposed in Web Workers. The current guide accepts `signal` on `create()` and `clone()` as well as prompting; this corrects conflicting guidance in the retrieved skill guide. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- Chrome lists English, Japanese, Spanish, German, and French as supported language declarations. NoBait omits declarations and passes Danish directly; successful Danish retrieval remains an empirical question. [Chrome language options](https://developer.chrome.com/docs/ai/prompt-api#add_expected_input_and_output)
- Model readiness depends on the device, storage, and model download. Check actual availability rather than guessing from a browser version. Chrome currently requires 22 GB free space during eligibility checks; that is not the model's download size. After preparation, inference is local and does not need an AI API key. [Chrome setup and requirements](https://developer.chrome.com/docs/ai/get-started)
- Firefox does not currently implement this API. Preserve Jev there; Gemini Nano through Chrome is not a Firefox implementation. [MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/LanguageModel.json)

## Proposed Haystack integration

Use the extension side panel as the model owner. Its lifetime already matches the current search experience. NoBait's offscreen runtime supports automatic processing after its setup surface closes; Haystack does not need that workflow for this experiment. Confirm actual inference in the side panel during implementation.

1. Add an explicit search-provider setting: **TypeSafe / Jev** and **Chrome local / Gemini Nano (experimental)**. Preserve the existing provider for current installations.
2. Add a local model adapter for availability, preparation progress, base-session ownership, cancellation, and disposal. Begin download-triggering creation directly from the setup button's gesture.
3. Route `Platform.search` through the selected provider. Keep DOM/PDF capture and navigation independent of model selection.
4. Give each local batch the query, original passage IDs, headings, and numbered original sentences. Require a result for every passage, including non-matches. Validate completeness, duplicates, IDs, and sentence bounds against the supplied batch.
5. Start with a relevance decision and a selected sentence ID. Map that ID back to Haystack's original sentence offsets; never use model-generated quotation text or model-generated character offsets.
6. Use measured context capacity, including prompt/schema overhead and response room, to size batches. Process batches serially with independent clones. Split oversized inputs without dropping text, and retain their original source mapping. Report progress by passages evaluated.
7. Abort and release model sessions when a search is cancelled, superseded, the source changes, or the panel closes. Test that an older request cannot overwrite a newer selection or result.

An unavailable local model should report the condition and expose the user's provider choice. It should not silently send a local search to TypeSafe.

### Existing boundaries that must change

| Haystack source | Change needed |
| --- | --- |
| `src/extension/platform.ts` | Currently binds `search` directly to `searchPage` from TypeSafe; dispatch by provider |
| `src/ui/platform.ts` | Add a capability/preparation contract for the selected provider |
| `src/extension/settings.ts`, `src/core/types.ts` | Persist provider choice with a backward-compatible default; distinguish provider-specific settings and result evidence |
| `src/ui/use-search.ts` | Replace unconditional API-key gating with provider readiness; keep cancellation and progress |
| `src/ui/Settings.tsx`, `src/ui/App.tsx` | Provider selection, model preparation, readiness, and accurate local/remote disclosure |
| `src/ui/Results.tsx`, `src/core/markdown.ts` | Report the actual provider and its result semantics; avoid displaying invented TypeSafe probabilities for local matches |

The capture and navigation code can retain the same passage IDs, text, sentence offsets, and PDF page references. A provider-neutral result-evidence type would replace the current assumption that every match carries a TypeSafe probability.

### Scores and thresholds

Jev currently returns a `noul` value which Haystack filters at a default of 0.58. Asking a generative model to emit a decimal does not establish an equivalent scale. For the initial comparison, use explicit relevant/not-relevant decisions and exact sentence selection, with source-order results. Treat graded ranking and any local threshold as later experiments that need evaluation. Preserve Jev's existing relevance controls for Jev.

## First experiment

Use the same captured snapshot for both providers so changes in a virtual table do not distort the comparison. Include the query and nearby headings in both paths. Establish expected relevant passages independently; Jev's output is a comparison, not ground truth.

| Input | What it tests |
| --- | --- |
| Existing travel-policy fixture, cancellation/refund questions | Direct answers, exceptions, unrelated passages, exact sentence mapping |
| Captured US500 company passages, including repeated industry names | Short table cells, duplicate text, source-ID integrity |
| Danish DBU rulebook passages, then the full PDF | Direct Danish understanding, domain language, long-document completion and speed |
| Source containing instruction-like text | Treating document content as evidence rather than model instructions |

Record Chrome version and hardware, capability state, model setup outcome, cold-start and warm latency, total search time, expected matches found/missed, irrelevant matches, and sentence-ID validity. Test cancellation and confirm that local mode sends no query or passage data to the TypeSafe endpoint. Keep synthetic/mocked checks distinct from actual Nano output.

An isolated automated browser may have a different model download state from the user's normal profile. If it cannot run inference, report that exact environment limitation instead of claiming the device cannot support the model.

## Recommendation

Proceed with an opt-in Chrome experiment that runs direct passage classification in the side panel. Compare English and Danish results before deciding whether it should become a default. The reference provides the lifecycle and structured-output patterns; retrieval quality, latency, and local scoring still need measurement.
