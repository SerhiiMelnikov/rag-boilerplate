import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  extractFromUrl,
  InvalidUrlError,
  UnsupportedContentTypeError,
  ResponseTooLargeError,
} from "@/lib/rag/extract-url";

const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf-8");

// Builds a fake fetchFn returning a single canned Response, for injection via
// deps.fetchFn. No test in this file touches the network.
function fakeFetch(body: string, contentType = "text/html; charset=utf-8", status = 200): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { "content-type": contentType } })) as unknown as typeof fetch;
}

// Like fakeFetch, but for a raw byte body -- passing a JS string to the
// Response constructor has it re-encoded as UTF-8, which would defeat a test
// of non-UTF-8 charset sniffing. Also lets a test simulate a redirected
// response's `.url` differing from the originally requested URL.
function fakeFetchBytes(body: Buffer, contentType: string, responseUrl = ""): typeof fetch {
  return (async () => {
    // Buffer's generic ArrayBufferLike parameter (it may back onto a
    // SharedArrayBuffer) is narrower than lib.dom's BodyInit expects here;
    // Buffer is a Uint8Array at runtime, so this is a type-only bridge.
    const res = new Response(body as unknown as BodyInit, { status: 200, headers: { "content-type": contentType } });
    if (responseUrl) Object.defineProperty(res, "url", { value: responseUrl, configurable: true });
    return res;
  }) as unknown as typeof fetch;
}

describe("extractFromUrl", () => {
  it("extracts the article's title and text, stripping nav/footer/cookie-banner furniture", async () => {
    const html = await fixture("article.html");
    const result = await extractFromUrl("https://example.com/article", {
      fetchFn: fakeFetch(html),
    });

    expect(result.title).toBe("The Slow Death of the Local Bookstore");
    expect(result.text).toContain("Independent bookstores have been closing");
    expect(result.text).toContain("loyal customers who browse");
    // The furniture Readability is supposed to strip.
    expect(result.text).not.toContain("cookies");
    expect(result.text).not.toContain("Privacy Policy");
    expect(result.text).not.toContain("Trending now");
  });

  it("falls back to the document's text content when Readability finds no article", async () => {
    const html = await fixture("no-article.html");
    const result = await extractFromUrl("https://example.com/app", {
      fetchFn: fakeFetch(html),
    });

    // Readability.parse() returns null for this fixture (verified directly against
    // the library); extractFromUrl must not throw, and should still surface
    // whatever plain text/title the raw document has instead.
    expect(result.title).toBe("App");
    expect(typeof result.text).toBe("string");
  });

  it("rejects a non-http(s) scheme", async () => {
    await expect(extractFromUrl("file:///etc/passwd")).rejects.toBeInstanceOf(InvalidUrlError);
    await expect(extractFromUrl("javascript:alert(1)")).rejects.toBeInstanceOf(InvalidUrlError);
  });

  it("rejects a malformed URL", async () => {
    await expect(extractFromUrl("not a url")).rejects.toBeInstanceOf(InvalidUrlError);
  });

  it("rejects a non-HTML content-type", async () => {
    const fetchFn = fakeFetch("%PDF-1.4 binary garbage that looks nothing like HTML", "application/pdf");
    await expect(
      extractFromUrl("https://example.com/report.pdf", { fetchFn }),
    ).rejects.toBeInstanceOf(UnsupportedContentTypeError);
  });

  it("rejects a response larger than the size cap", async () => {
    const oversized = "a".repeat(10 * 1024 * 1024 + 1); // one byte past the 10 MB cap
    const fetchFn = fakeFetch(oversized);
    await expect(
      extractFromUrl("https://example.com/huge", { fetchFn }),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("surfaces a clear error when the fetch is aborted (simulating a timeout)", async () => {
    const fetchFn = (async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as unknown as typeof fetch;

    await expect(extractFromUrl("https://example.com/slow", { fetchFn })).rejects.toThrow(
      /timed out/i,
    );
  });

  it("sniffs a non-UTF-8 charset from the content-type header instead of assuming UTF-8 (avoids mojibake)", async () => {
    const html =
      `<!DOCTYPE html><html><head><meta charset="iso-8859-1"><title>Café article</title></head>` +
      `<body><article><p>${"filler word ".repeat(40)}A café serves café, résumé writers browse naïve prose. ${"filler word ".repeat(40)}</p></article></body></html>`;
    // "latin1" is Node's name for ISO-8859-1: it encodes each code point <= 0xFF
    // as a single byte (e.g. é, U+00E9, -> byte 0xE9). Decoding those bytes as
    // UTF-8 -- the pre-fix behavior -- treats 0xE9 as an incomplete multi-byte
    // sequence and replaces it with the U+FFFD mojibake marker.
    const bytes = Buffer.from(html, "latin1");
    const result = await extractFromUrl("https://example.com/latin1", {
      fetchFn: fakeFetchBytes(bytes, "text/html; charset=iso-8859-1"),
    });
    expect(result.text).toContain("café");
    expect(result.text).toContain("résumé");
    expect(result.text).toContain("naïve");
    expect(result.text).not.toContain("�");
  });

  it("rejects a non-ok HTTP response", async () => {
    const fetchFn = fakeFetch("<html><body>Not Found</body></html>", "text/html", 404);
    await expect(extractFromUrl("https://example.com/missing", { fetchFn })).rejects.toThrow(
      /404/,
    );
  });
});
