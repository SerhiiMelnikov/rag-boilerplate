import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getVisionModel } from "@/lib/providers";
import { MissingProviderKeyError } from "@/lib/providers/types";

export class UnsupportedFileTypeError extends Error {
  constructor(ext: string) {
    super(`Unsupported file type: ${ext}`);
    this.name = "UnsupportedFileTypeError";
  }
}

// Safety net only: layout-heavy PDFs can legitimately take minutes to parse, so
// this is a last-resort guard against a truly stalled generation (which would
// otherwise leave ingestion hanging forever). On timeout the call aborts and the
// caller falls back to flat text extraction. Generous by design; tune per setup.
const PDF_VISION_TIMEOUT_MS = Number(process.env.GOOGLE_PDF_PARSE_TIMEOUT_MS) || 600_000;

const PDF_VISION_PROMPT = `You are a precise document text extractor. Extract ALL textual content from this PDF into clean Markdown.
Rules:
- Preserve the natural reading order. For multi-column layouts, keep each logical row/entry together: never merge a heading with the first column value, and never shift labels between entries.
- Render tabular or columnar data as Markdown tables.
- Do not summarize, translate, or add commentary. Output only the document's content.`;

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

// --- Layout detection -------------------------------------------------------

interface LayoutItem {
  x: number; // left edge (PDF user-space units)
  y: number; // baseline (larger = higher on the page)
  w: number; // text run width
}

// A horizontal gap wider than this fraction of the page is treated as a
// column boundary rather than ordinary inter-word spacing.
const GAP_FRACTION = 0.15;
// y distance (PDF units) within which items are considered the same visual line.
const LINE_TOLERANCE = 3;
// Minimum number of column-split lines before a page counts as multi-column,
// plus the share of multi-item lines that must be split. Both guard against
// false positives (which would trigger an avoidable model call).
const MIN_SPLIT_LINES = 3;
const SPLIT_RATIO = 0.3;

// Pure, testable heuristic: do these text items form a multi-column layout?
// Groups items into visual lines by y, then flags a line as "split" when it
// contains a horizontal gap far wider than normal word spacing.
export function isColumnar(items: LayoutItem[], pageWidth: number): boolean {
  if (pageWidth <= 0 || items.length < 6) return false;
  const gapThreshold = pageWidth * GAP_FRACTION;

  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines: LayoutItem[][] = [];
  let current: LayoutItem[] = [];
  let lineY = Infinity;
  for (const item of sorted) {
    if (current.length === 0 || Math.abs(item.y - lineY) <= LINE_TOLERANCE) {
      current.push(item);
      lineY = current.length === 1 ? item.y : lineY;
    } else {
      lines.push(current);
      current = [item];
      lineY = item.y;
    }
  }
  if (current.length) lines.push(current);

  let multiItemLines = 0;
  let splitLines = 0;
  for (const line of lines) {
    if (line.length < 2) continue;
    multiItemLines++;
    const byX = [...line].sort((a, b) => a.x - b.x);
    for (let i = 1; i < byX.length; i++) {
      const gap = byX[i].x - (byX[i - 1].x + byX[i - 1].w);
      if (gap > gapThreshold) {
        splitLines++;
        break;
      }
    }
  }

  return (
    splitLines >= MIN_SPLIT_LINES &&
    multiItemLines > 0 &&
    splitLines / multiItemLines >= SPLIT_RATIO
  );
}

// Inspect the first few pages of a parsed PDF for a multi-column layout that
// flat text extraction would scramble.
async function detectComplexPdf(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<boolean> {
  const pages = Math.min(pdf.numPages, 3);
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: LayoutItem[] = content.items
      // pdf.js text items carry `str`, a 6-element `transform` ([..,..,..,..,x,y])
      // and `width`; marked-content items lack `str` and are skipped.
      .filter((i): i is typeof i & { str: string } => typeof (i as { str?: unknown }).str === "string")
      .filter((i) => i.str.trim().length > 0)
      .map((i) => {
        const t = (i as { transform: number[] }).transform;
        return { x: t[4], y: t[5], w: (i as { width?: number }).width ?? 0 };
      });
    if (isColumnar(items, viewport.width)) return true;
  }
  return false;
}

// Re-extract a layout-heavy PDF with a multimodal model that respects 2D
// structure. Gemini accepts the PDF bytes directly (no rasterization).
async function extractPdfMultimodal(data: Buffer, model: LanguageModel): Promise<string> {
  const { text } = await generateText({
    model,
    abortSignal: AbortSignal.timeout(PDF_VISION_TIMEOUT_MS),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PDF_VISION_PROMPT },
          { type: "file", data: new Uint8Array(data), mimeType: "application/pdf" },
        ],
      },
    ],
  });
  return text;
}

export interface ParseDeps {
  // Injectable for tests / alternative strategies.
  detectComplex?: (pdf: Awaited<ReturnType<typeof getDocumentProxy>>) => Promise<boolean>;
  extractMultimodal?: (data: Buffer) => Promise<string>;
}

// Parse a document buffer to plain text, routing by file extension.
// PDFs use flat text extraction by default; when a multi-column/table layout is
// detected, they fall back to multimodal extraction (which preserves reading
// order), and back to flat text again if that model call fails.
export async function parseDocument(
  filename: string,
  data: Buffer,
  settings: RuntimeSettings,
  deps: ParseDeps = {},
): Promise<string> {
  const ext = extOf(filename);
  switch (ext) {
    case ".md":
    case ".markdown":
    case ".txt":
      return data.toString("utf-8");
    case ".pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: true });

      const detect = deps.detectComplex ?? detectComplexPdf;
      let complex = false;
      try {
        complex = await detect(pdf);
      } catch {
        complex = false; // detection failure: keep the safe flat-text path
      }
      if (!complex) return text;

      const extractMM =
        deps.extractMultimodal ??
        (async (d: Buffer) => {
          let model: LanguageModel;
          try {
            model = getVisionModel(settings);
          } catch (err) {
            if (err instanceof MissingProviderKeyError) {
              // Not silent: warn on the server; the Admin UI flags the missing
              // key at config time. Ingest proceeds with flat text.
              console.warn(`PDF layout parse skipped — ${err.message}`);
              return "";
            }
            throw err;
          }
          return extractPdfMultimodal(d, model);
        });
      try {
        const md = await extractMM(data);
        return md && md.trim().length > 0 ? md : text;
      } catch {
        return text; // model/network failure: graceful fallback to flat text
      }
    }
    case ".docx": {
      const { value } = await mammoth.extractRawText({ buffer: data });
      return value;
    }
    default:
      throw new UnsupportedFileTypeError(ext || "(none)");
  }
}
