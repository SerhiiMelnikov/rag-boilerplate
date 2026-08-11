import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

// Pull the `--c-*: R G B;` declarations out of one selector's block.
function parseTokens(selector: string, source: string = css): Record<string, [number, number, number]> {
  // Strip CSS comments first, before locating the block -- exactly as
  // declaredProperties below does, and for the same reason: a `}` inside a comment
  // would otherwise truncate the block search. Stripping AFTER the boundary is
  // found is a no-op, which is how the sibling's first fix attempt went wrong.
  const strippedSource = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = strippedSource.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`globals.css has no "${selector} {" block`);
  const end = strippedSource.indexOf("}", start);
  if (end === -1) throw new Error(`"${selector}" block is never closed`);
  const out: Record<string, [number, number, number]> = {};
  for (const m of strippedSource.slice(start, end).matchAll(/--c-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

// Every custom property declared in a selector's block, whatever shape its value
// takes -- unlike parseTokens above (RGB triples only, because that's what the
// contrast math needs), this is what the parity check below requires: a
// `--c-overlay: rgb(0 0 0 / .5)` or a non-colour `--radius-pop: 8px` must still
// be caught if it exists in only one of the two blocks. parseTokens's own key set
// would silently omit both, since neither matches its "R G B" pattern.
function declaredProperties(selector: string, source: string = css): Set<string> {
  // Strip CSS comments first, before locating the block. This prevents a `}` inside
  // a comment from prematurely truncating the block search.
  const strippedSource = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = strippedSource.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`globals.css has no "${selector} {" block`);
  const end = strippedSource.indexOf("}", start);
  if (end === -1) throw new Error(`"${selector}" block is never closed`);
  const out = new Set<string>();
  for (const m of strippedSource.slice(start, end).matchAll(/--([a-z0-9-]+):/g)) out.add(m[1]);
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
  ["ink-muted", "surface-2", 4.5],
  ["ink-subtle", "bg", 3],
  ["ink-subtle", "surface", 3],
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
  // Syntax highlighting draws these on a `surface-2` code block (globals.css .hljs-*).
  ["accent", "surface-2", 4.5],
  ["success", "surface-2", 4.5],
  ["warning", "surface-2", 4.5],
  ["danger", "surface-2", 4.5],
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

// `--c-shade` exists only to stay dark in both themes (unlike `--c-ink`, which
// deliberately inverts), so being declared in both :root and .dark is its entire
// reason to exist -- neither PAIRS nor the "declares every token" check above
// would ever notice one of them missing it, since both only walk the tokens each
// *pair* references. This compares the two blocks' own declared-property sets
// directly (every `--*`, not just the `--c-*` RGB triples parseTokens extracts),
// so a token added to only one of them fails here instead of shipping unnoticed
// -- whether or not it happens to be a colour.
// The scan used a bare /--([a-z0-9-]+):/g over the block text, which cannot
// tell a real declaration from one inside a comment. No false result today —
// this is a tripwire against a future commented-out token being counted as
// present in one block and absent in the other, which would fail the parity
// test below for a reason that does not exist.
it("ignores custom properties inside CSS comments", () => {
  const source = ":root {\n  --c-real: 1 2 3;\n  /* --c-commented: 4 5 6; */\n}";
  const found = declaredProperties(":root", source);
  expect(found.has("c-real")).toBe(true);
  expect(found.has("c-commented")).toBe(false);
});

// Comments containing `}` would truncate the block if comments were stripped after
// locating the block boundary. This test ensures the block is found in comment-free
// text so that a `}` inside a comment does not prematurely end the scan.
it("finds declarations after a comment containing }", () => {
  const source = ":root {\n  /* comment } with closing brace */\n  --c-real: 1 2 3;\n}";
  const found = declaredProperties(":root", source);
  expect(found.has("c-real")).toBe(true);
});

it("declares the same set of custom properties in :root and .dark", () => {
  const light = [...declaredProperties(":root")].sort();
  const dark = [...declaredProperties(".dark")].sort();
  expect(dark).toEqual(light);
});

describe("parseTokens", () => {
  it("ignores a closing brace inside a comment", () => {
    // The `}` sits near the START of the comment, with real declarations after it.
    // This shape catches BOTH broken orderings, not just one:
    //  - stripping never happens (or happens on the raw source only): the block
    //    boundary lands on the in-comment `}`, before either declaration.
    //  - stripping happens AFTER the boundary is located (the sibling's first-attempt
    //    bug): the boundary index, found on the raw string, is stale once the comment
    //    text is removed and no longer lines up with the stripped string's offsets --
    //    with this fixture that stale offset undershoots and the slice comes up empty,
    //    same as the unstripped case. A fixture with the `}` deep inside the comment
    //    (e.g. near its end) does not catch this: the stale offset can then overshoot
    //    far enough to accidentally include every real declaration anyway.
    const fixture = `:root {\n  /* } stray brace in a comment */\n  --c-a: 1 2 3;\n  --c-b: 4 5 6;\n}`;
    expect(parseTokens(":root", fixture)).toEqual({ a: [1, 2, 3], b: [4, 5, 6] });
  });
});
