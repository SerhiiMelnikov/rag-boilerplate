import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

// Pull the `--c-*: R G B;` declarations out of one selector's block.
function parseTokens(selector: string): Record<string, [number, number, number]> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`globals.css has no "${selector} {" block`);
  const end = css.indexOf("}", start);
  if (end === -1) throw new Error(`"${selector}" block is never closed`);
  const out: Record<string, [number, number, number]> = {};
  for (const m of css.slice(start, end).matchAll(/--c-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum]. 4.5:1 for normal text, 3:1 for large text
// and icons. Every pair the design actually puts on screen is listed here; a new
// combination in a component means a new line here first.
const PAIRS: [string, string, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "surface-2", 4.5],
  ["ink-muted", "bg", 4.5],
  ["ink-muted", "surface", 4.5],
  ["ink-subtle", "bg", 3],
  ["ink-subtle", "surface-2", 3],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "accent-soft", 4.5],
  ["accent-ink", "accent", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "danger-soft", 4.5],
  ["danger-ink", "danger", 4.5],
];

describe.each([
  [":root", "light"],
  [".dark", "dark"],
])("%s (%s theme) token contrast", (selector, theme) => {
  const tokens = parseTokens(selector);

  it("declares every token the pair list references", () => {
    const referenced = new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]));
    for (const name of referenced) {
      expect(tokens[name], `--c-${name} missing from ${selector}`).toBeDefined();
    }
  });

  it.each(PAIRS)(`${theme}: %s on %s reaches %s:1`, (fg, bg, min) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});
