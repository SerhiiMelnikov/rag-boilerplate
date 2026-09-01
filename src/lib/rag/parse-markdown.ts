import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname } from "node:path";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getVisionModel } from "@/lib/providers";
import { MissingProviderKeyError } from "@/lib/providers/types";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Root, RootContent, Image } from "mdast";

export interface ParseMarkdownDeps {
  baseDir?: string;
  boundary?: string;
  captionImage?: (bytes: Buffer, alt: string) => Promise<string>;
}

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif",
};

const CAPTION_PROMPT =
  "Describe this image for a document search index. One or two sentences, concrete and factual. No preamble.";

function defaultCaption(settings: RuntimeSettings) {
  return async (bytes: Buffer, _alt: string): Promise<string> => {
    let model: LanguageModel;
    try {
      model = getVisionModel(settings);
    } catch (err) {
      if (err instanceof MissingProviderKeyError) return ""; // no key -> skip captioning
      throw err;
    }
    const mime = IMAGE_MIME[extname(_alt).toLowerCase()] ?? "image/png";
    const { text } = await generateText({
      model,
      messages: [{ role: "user", content: [
        { type: "text", text: CAPTION_PROMPT },
        { type: "file", data: new Uint8Array(bytes), mimeType: mime },
      ] }],
    });
    return text.trim();
  };
}

// Resolve a Markdown image src to a readable local file inside `boundary`.
// Returns null for remote urls, non-image extensions, or anything escaping the
// boundary — those keep their alt text and never touch the network.
function resolveLocalImage(src: string, baseDir: string, boundary: string): string | null {
  if (/^[a-z]+:\/\//i.test(src) || src.startsWith("data:")) return null;
  const abs = isAbsolute(src) ? src : resolve(baseDir, src);
  const rel = relative(boundary, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  if (!(extname(abs).toLowerCase() in IMAGE_MIME)) return null;
  return abs;
}

// Block-level container nodes whose children are separate blocks and must be
// joined with a newline. Inline containers (strong, emphasis, link, ...) are NOT
// listed here: their children are concatenated with no separator so formatting
// never injects stray newlines mid-sentence.
const BLOCK_CONTAINERS: Record<string, true> = {
  root: true, list: true, listItem: true, blockquote: true,
  table: true, footnoteDefinition: true,
};

// Serialize an mdast node subtree to clean text. Headings are re-emitted with
// their `#` prefix so chunkMarkdown can still find section boundaries; image
// captions are honored at any depth.
function renderNode(node: RootContent, imageText: Map<Image, string>): string {
  if (node.type === "image") return imageText.get(node) ?? node.alt ?? "";
  if (node.type === "heading") return `${"#".repeat(node.depth)} ${mdastToString(node)}`;
  if (node.type === "tableRow" && "children" in node && Array.isArray(node.children)) {
    return node.children.map((c) => renderNode(c as RootContent, imageText)).join(" | ");
  }
  if (node.type === "paragraph") {
    return node.children.map((c) => renderNode(c as RootContent, imageText)).join("").trim();
  }
  if (node.type in BLOCK_CONTAINERS && "children" in node && Array.isArray(node.children)) {
    return node.children
      .map((c) => renderNode(c as RootContent, imageText))
      .filter((s) => s.trim().length > 0)
      .join("\n");
  }
  // Inline container (strong, emphasis, delete, link, linkReference, ...):
  // concatenate children so an image caption nested inside survives without
  // breaking the surrounding sentence onto multiple lines.
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((c) => renderNode(c as RootContent, imageText)).join("");
  }
  return mdastToString(node);
}

export async function parseMarkdown(data: Buffer, settings: RuntimeSettings, deps: ParseMarkdownDeps = {}): Promise<string> {
  const raw = data.toString("utf-8");
  try {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(raw) as Root;

    // Collect image nodes, caption the local resolvable ones.
    const images: Image[] = [];
    const visit = (n: RootContent | Root) => {
      if ("children" in n && Array.isArray(n.children)) for (const c of n.children) visit(c as RootContent);
      if ((n as RootContent).type === "image") images.push(n as Image);
    };
    visit(tree);

    const imageText = new Map<Image, string>();
    if (deps.baseDir) {
      const boundary = deps.boundary ?? deps.baseDir;
      const caption = deps.captionImage ?? defaultCaption(settings);
      for (const img of images) {
        const abs = resolveLocalImage(img.url ?? "", deps.baseDir, boundary);
        if (!abs) continue;
        try {
          const bytes = await readFile(abs);
          const desc = await caption(bytes, img.url ?? "");
          if (desc) imageText.set(img, `\n[Image: ${desc}]\n`);
        } catch {
          // Unreadable file or caption failure: keep alt text, never fail ingest.
        }
      }
    }

    const blocks = tree.children.map((c) => renderNode(c, imageText)).filter((s) => s.trim().length > 0);
    const out = blocks.join("\n\n").trim();
    return out.length > 0 ? out : raw;
  } catch {
    return raw; // any parse failure: flat text, exactly like the PDF fallback
  }
}
