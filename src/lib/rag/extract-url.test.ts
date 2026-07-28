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

  it("rejects a non-ok HTTP response", async () => {
    const fetchFn = fakeFetch("<html><body>Not Found</body></html>", "text/html", 404);
    await expect(extractFromUrl("https://example.com/missing", { fetchFn })).rejects.toThrow(
      /404/,
    );
  });
});
