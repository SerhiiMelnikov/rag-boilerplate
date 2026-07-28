import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export class UnsupportedContentTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedContentTypeError";
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

// This runs server-side, fetching a URL an admin typed in, so the input is
// treated as hostile: only http/https schemes are fetched (no file:/data:/etc),
// the request is bounded by a timeout, and the body is capped so a slow or
// oversized (or outright malicious) response can't hang ingestion or exhaust
// memory. AbortSignal.timeout(15_000): generous enough for a slow article page,
// short enough that one bad URL doesn't stall an ingest run.
const FETCH_TIMEOUT_MS = 15_000;
// 10 MB comfortably covers even a heavy, image-link-laden article page's markup;
// anything past that is far more likely a misidentified binary or a hostile
// response than real article HTML.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export interface ExtractUrlDeps {
  // Injectable for tests; defaults to the global fetch. No test may hit the network.
  fetchFn?: typeof fetch;
}

export interface ExtractedArticle {
  title: string;
  text: string;
}

// Read a fetch Response body in bounded chunks, rejecting once the total
// exceeds maxBytes rather than trusting a (possibly absent or dishonest)
// Content-Length header and buffering an arbitrarily large body into memory.
async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(
        `Response body exceeds the ${maxBytes}-byte cap`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

// Fetch a URL and extract clean, readable article text from it — the raw
// navigation/footer/cookie-banner furniture is exactly what poisons retrieval,
// so this runs Readability over the DOM rather than a regex strip.
export async function extractFromUrl(
  url: string,
  deps: ExtractUrlDeps = {},
): Promise<ExtractedArticle> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidUrlError(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError(
      `Unsupported URL scheme "${parsed.protocol}" (only http/https are allowed)`,
    );
  }

  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    // AbortSignal.timeout fires a DOMException named "TimeoutError" (or, on
    // manual abort, "AbortError"); surface a message that names the cause
    // instead of letting a raw DOMException bubble up to the caller.
    const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new UnsupportedContentTypeError(
      `Unsupported content-type "${contentType || "(none)"}" for ${url} (expected HTML)`,
    );
  }

  const html = await readBodyCapped(response, MAX_RESPONSE_BYTES);

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (article && article.textContent && article.textContent.trim().length > 0) {
    return { title: (article.title ?? "").trim(), text: article.textContent.trim() };
  }

  // Some pages (SPA shells, listing pages, anything without clear article
  // structure) defeat Readability and it returns null. Fall back to the raw
  // document's text content rather than throwing: a mediocre extraction is
  // more useful than a failed ingest. Re-parse into a fresh document because
  // Readability.parse() mutates the document it was given.
  const fallbackDom = new JSDOM(html, { url });
  return {
    title: (fallbackDom.window.document.title ?? "").trim(),
    text: (fallbackDom.window.document.body?.textContent ?? "").trim(),
  };
}
