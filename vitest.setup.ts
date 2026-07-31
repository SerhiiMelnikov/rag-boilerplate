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
