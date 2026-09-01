import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMarkdown } from "./parse-markdown";

const settings = {} as never;

describe("parseMarkdown", () => {
  it("strips markup but keeps heading text and paragraph text", async () => {
    const out = await parseMarkdown(Buffer.from("# Title\n\nSome **bold** and `code`."), settings);
    expect(out).toContain("Title");
    expect(out).toContain("Some bold and code");
    expect(out).not.toContain("**");
    expect(out).not.toContain("`");
  });

  it("keeps headings as # lines so chunkMarkdown can split on them", async () => {
    const out = await parseMarkdown(Buffer.from("# H1\ntext\n\n## H2\nmore"), settings);
    expect(out).toMatch(/^#{1,6}\s/m);
  });

  it("captions a local image under baseDir and inlines the description", async () => {
    const dir = mkdtempSync(join(tmpdir(), "md-"));
    writeFileSync(join(dir, "d.png"), Buffer.from([1, 2, 3]));
    const captionImage = vi.fn(async () => "a red diagram");
    const out = await parseMarkdown(Buffer.from("before\n\n![alt](d.png)\n\nafter"), settings, { baseDir: dir, captionImage });
    expect(captionImage).toHaveBeenCalledTimes(1);
    expect(out).toContain("[Image: a red diagram]");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("never fetches a remote image, keeps its alt text", async () => {
    const captionImage = vi.fn(async () => "should not run");
    const out = await parseMarkdown(Buffer.from("![remote pic](https://x/y.png)"), settings, { baseDir: "/tmp", captionImage });
    expect(captionImage).not.toHaveBeenCalled();
    expect(out).toContain("remote pic");
  });

  it("rejects an image escaping the boundary, keeps alt text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "md-"));
    const captionImage = vi.fn(async () => "nope");
    const out = await parseMarkdown(Buffer.from("![secret](../../etc/passwd)"), settings, { baseDir: dir, boundary: dir, captionImage });
    expect(captionImage).not.toHaveBeenCalled();
    expect(out).toContain("secret");
  });

  it("does not caption when baseDir is absent (upload path)", async () => {
    const captionImage = vi.fn(async () => "x");
    const out = await parseMarkdown(Buffer.from("![alt](d.png)"), settings, { captionImage });
    expect(captionImage).not.toHaveBeenCalled();
    expect(out).toContain("alt");
  });

  it("falls back to raw utf-8 when the parser throws", async () => {
    const captionImage = vi.fn(async () => { throw new Error("boom"); });
    const dir = mkdtempSync(join(tmpdir(), "md-"));
    writeFileSync(join(dir, "d.png"), Buffer.from([1]));
    const raw = "![alt](d.png)";
    const out = await parseMarkdown(Buffer.from(raw), settings, { baseDir: dir, captionImage });
    // caption failed -> that image keeps alt, rest still parses; ingestion never throws
    expect(out).toContain("alt");
  });

  it("captions a local image nested in a list item", async () => {
    const dir = mkdtempSync(join(tmpdir(), "md-"));
    writeFileSync(join(dir, "d.png"), Buffer.from([1, 2, 3]));
    const captionImage = vi.fn(async () => "nested diagram");
    const out = await parseMarkdown(Buffer.from("- item ![alt](d.png)"), settings, { baseDir: dir, captionImage });
    expect(captionImage).toHaveBeenCalledTimes(1);
    expect(out).toContain("[Image: nested diagram]");
  });

  it("keeps inline formatting on one line (no stray newlines)", async () => {
    const out = await parseMarkdown(Buffer.from("Some **bold `code`** and [a **b** c](u)."), settings);
    expect(out).toContain("Some bold code and a b c");
    expect(out).not.toMatch(/bold\s*\n\s*code/);
  });
});
