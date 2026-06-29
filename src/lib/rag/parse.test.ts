import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseDocument, isColumnar, UnsupportedFileTypeError } from "@/lib/rag/parse";

const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe("parseDocument", () => {
  it("parses markdown", async () => {
    const text = await parseDocument("sample.md", await fixture("sample.md"));
    expect(text).toContain("Hello world from markdown");
  });

  it("parses plain text", async () => {
    const text = await parseDocument("sample.txt", await fixture("sample.txt"));
    expect(text).toContain("Hello world from text");
  });

  it("parses pdf", async () => {
    const text = await parseDocument("sample.pdf", await fixture("sample.pdf"));
    expect(text).toContain("Hello");
  });

  it("parses docx", async () => {
    const text = await parseDocument("sample.docx", await fixture("sample.docx"));
    expect(text).toContain("Hello");
  });

  it("throws on unsupported type", async () => {
    await expect(parseDocument("a.xyz", Buffer.from("x"))).rejects.toBeInstanceOf(
      UnsupportedFileTypeError,
    );
  });

  it("uses multimodal extraction for a complex (multi-column) pdf", async () => {
    const text = await parseDocument("sample.pdf", await fixture("sample.pdf"), {
      detectComplex: async () => true,
      extractMultimodal: async () => "# Faithful Markdown\n\n| God | Role |",
    });
    expect(text).toContain("Faithful Markdown");
  });

  it("falls back to flat text when multimodal extraction fails", async () => {
    const text = await parseDocument("sample.pdf", await fixture("sample.pdf"), {
      detectComplex: async () => true,
      extractMultimodal: async () => {
        throw new Error("model unavailable");
      },
    });
    expect(text).toContain("Hello");
  });

  it("keeps flat text for a simple (single-column) pdf", async () => {
    let multimodalCalled = false;
    const text = await parseDocument("sample.pdf", await fixture("sample.pdf"), {
      detectComplex: async () => false,
      extractMultimodal: async () => {
        multimodalCalled = true;
        return "should not be used";
      },
    });
    expect(text).toContain("Hello");
    expect(multimodalCalled).toBe(false);
  });
});

describe("isColumnar", () => {
  const pageWidth = 600;

  it("returns false for a single-column layout", () => {
    // Stacked lines, each a single run near the left margin.
    const items = Array.from({ length: 10 }, (_, i) => ({ x: 50, y: 700 - i * 20, w: 200 }));
    expect(isColumnar(items, pageWidth)).toBe(false);
  });

  it("returns false for normal word spacing within lines", () => {
    // Two words per line with a small gap — not a column boundary.
    const items: { x: number; y: number; w: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 700 - i * 20;
      items.push({ x: 50, y, w: 60 }, { x: 120, y, w: 60 });
    }
    expect(isColumnar(items, pageWidth)).toBe(false);
  });

  it("detects a multi-column layout with wide internal gaps", () => {
    // Three columns at x=50, 250, 450 — each row has gaps far wider than words.
    const items: { x: number; y: number; w: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const y = 700 - i * 20;
      items.push(
        { x: 50, y, w: 80 },
        { x: 250, y, w: 80 },
        { x: 450, y, w: 80 },
      );
    }
    expect(isColumnar(items, pageWidth)).toBe(true);
  });

  it("returns false for too few items", () => {
    expect(isColumnar([{ x: 50, y: 700, w: 80 }], pageWidth)).toBe(false);
  });
});
