// Sole reader of the documentsDirs setting: one path per line, trimmed, blanks dropped.
export function parseDirs(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}
