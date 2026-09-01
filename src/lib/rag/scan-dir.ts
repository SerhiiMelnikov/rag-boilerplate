import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { hashContent } from "./hash";

export const SUPPORTED = [".pdf", ".docx", ".md", ".markdown", ".txt"];
const SKIP_DIRS: Record<string, true> = { node_modules: true, ".git": true };

export interface ScannedFile { path: string; hash: string; baseDir: string; root: string }

async function walk(path: string, root: string, out: ScannedFile[], errors: string[]): Promise<void> {
  let s;
  try { s = await stat(path); } catch (err) { errors.push(`${path}: ${String(err)}`); return; }
  if (s.isFile()) {
    if (!SUPPORTED.some((ext) => path.toLowerCase().endsWith(ext))) return;
    const bytes = await readFile(path);
    out.push({ path, hash: hashContent(bytes.toString("base64")), baseDir: dirname(path), root });
    return;
  }
  let entries: string[];
  try { entries = await readdir(path); } catch (err) { errors.push(`${path}: ${String(err)}`); return; }
  for (const e of entries) {
    if (e.startsWith(".") || Object.hasOwn(SKIP_DIRS, e)) continue;
    await walk(join(path, e), root, out, errors);
  }
}

// Scan every configured directory. A single unreadable root is recorded in
// `errors` and skipped; the rest still scan.
export async function scanDirs(dirs: string[]): Promise<{ files: ScannedFile[]; errors: string[] }> {
  const files: ScannedFile[] = [];
  const errors: string[] = [];
  for (const dir of dirs) await walk(dir, dir, files, errors);
  return { files, errors };
}
