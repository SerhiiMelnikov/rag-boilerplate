import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDirs } from "./scan-dir";

describe("scanDirs", () => {
  it("collects supported files recursively with absolute path, baseDir, root, hash", async () => {
    const root = mkdtempSync(join(tmpdir(), "scan-"));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "a.md"), "alpha");
    writeFileSync(join(root, "sub", "b.txt"), "beta");
    writeFileSync(join(root, "ignore.bin"), "x");
    const { files, errors } = await scanDirs([root]);
    expect(errors).toEqual([]);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([join(root, "a.md"), join(root, "sub", "b.txt")]);
    const a = files.find((f) => f.path.endsWith("a.md"))!;
    expect(a.root).toBe(root);
    expect(a.baseDir).toBe(root);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports an unreadable dir without aborting the others", async () => {
    const good = mkdtempSync(join(tmpdir(), "scan-good-"));
    writeFileSync(join(good, "a.md"), "alpha");
    const { files, errors } = await scanDirs(["/definitely/not/here", good]);
    expect(files.map((f) => f.path)).toEqual([join(good, "a.md")]);
    expect(errors.length).toBe(1);
  });

  it("does not skip a dir named after an inherited Object property", async () => {
    const root = mkdtempSync(join(tmpdir(), "scan-proto-"));
    mkdirSync(join(root, "constructor"));
    writeFileSync(join(root, "constructor", "c.md"), "gamma");
    const { files, errors } = await scanDirs([root]);
    expect(errors).toEqual([]);
    expect(files.map((f) => f.path)).toEqual([join(root, "constructor", "c.md")]);
  });
});
