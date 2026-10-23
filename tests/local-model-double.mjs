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
      prompt: async (input, { signal, responseConstraint }) => {
        signal.throwIfAborted();
        if (input.startsWith('Query:')) { state.setupCalls++; return '{"p0":0}'; }
        state.calls.push(input);
        if (state.hold) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        if (input.startsWith('Rewrite')) return '{"keywords":"cancel cancellation refund"}';
        const allowed = responseConstraint.properties.quote.enum;
        return JSON.stringify({ quote: allowed.find((quote) => quote && /cancel|refund/i.test(quote)) ?? null });
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
