import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseDocument, UnsupportedFileTypeError } from "@/lib/rag/parse";

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
});
