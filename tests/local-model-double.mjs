// Installed only in automated test pages; never bundled into the extension.
export function installLocalModelDouble() {
  const state = { availability: 'downloadable', active: 0, hold: false, calls: [], setupCalls: 0 };
  window.localModelTest = state;
  function session(signal) {
    state.active++;
    let destroyed = false;
    const destroy = () => { if (!destroyed) { destroyed = true; state.active--; } };
    signal.addEventListener('abort', destroy, { once: true });
    return {
      contextWindow: 3500, contextUsage: 100,
      measureContextUsage: async (text, options) => text.length + JSON.stringify(options ?? {}).length,
      clone: async ({ signal }) => session(signal),
      destroy,
      prompt: async (input, { signal }) => {
        signal.throwIfAborted();
        if (!input.startsWith('{')) { state.setupCalls++; return '{"p0":0}'; }
        state.calls.push(JSON.parse(input));
        if (state.hold) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        return JSON.stringify(Object.fromEntries(JSON.parse(input).passages.map((p) => [p.id,
          p.sentences.find((s) => /cancel|refund/i.test(s.text))?.index ?? -1,
        ])));
      },
    };
  }
  Object.defineProperty(window, 'LanguageModel', { configurable: true, value: {
    availability: async () => state.availability,
    create: async ({ signal, monitor }) => {
      signal.throwIfAborted();
      const target = new EventTarget();
      monitor?.(target);
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: .5 }));
      state.availability = 'available';
      return session(signal);
    },
  } });
}
