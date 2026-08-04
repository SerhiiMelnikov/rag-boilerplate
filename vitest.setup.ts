import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver, which Headless UI's Listbox relies on.
// Provide a no-op stub so component tests exercising the dropdown don't throw.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom implements no matchMedia; Panel uses it to decide between its static column
// and its drawer. Default to desktop, matching the layout's desktop-first CSS.
if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia;
}

// Node 22+ ships its own global `localStorage`, a stub that stays undefined unless
// started with --localstorage-file. Vitest's jsdom environment only overrides globals
// it already knows about (see populateGlobal's KEYS allowlist), so that stub wins over
// jsdom's real Storage implementation and window.localStorage is left undefined even
// though jsdom does implement one internally. Repair it from jsdom's own window so
// tests exercise the real thing. First needed by src/lib/voice/preference.ts, the
// first module in the repo to touch localStorage.
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  const jsdomInstance = (globalThis as { jsdom?: { window?: Window } }).jsdom;
  if (jsdomInstance?.window?.localStorage) {
    Object.defineProperty(window, "localStorage", {
      value: jsdomInstance.window.localStorage,
      configurable: true,
    });
  }
}
