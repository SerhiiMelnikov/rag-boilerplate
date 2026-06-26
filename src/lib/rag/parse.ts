import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export class UnsupportedFileTypeError extends Error {
  constructor(ext: string) {
    super(`Unsupported file type: ${ext}`);
    this.name = "UnsupportedFileTypeError";
  }
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

// Parse a document buffer to plain text, routing by file extension.
export async function parseDocument(filename: string, data: Buffer): Promise<string> {
  const ext = extOf(filename);
  switch (ext) {
    case ".md":
    case ".markdown":
    case ".txt":
      return data.toString("utf-8");
    case ".pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    }
    case ".docx": {
      const { value } = await mammoth.extractRawText({ buffer: data });
      return value;
    }
    default:
      throw new UnsupportedFileTypeError(ext || "(none)");
  }
}
