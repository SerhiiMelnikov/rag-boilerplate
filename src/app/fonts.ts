import localFont from "next/font/local";

// Vendored, not fetched. next/font/google downloads at build time, so a generated
// project building offline or behind a locked-down CI would fail on `next build`.
export const sans = localFont({
  src: [{ path: "./fonts/public-sans-variable.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

// Machine data only: counts, scores, token totals, ids, model names, keys.
export const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});
