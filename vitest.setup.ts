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
