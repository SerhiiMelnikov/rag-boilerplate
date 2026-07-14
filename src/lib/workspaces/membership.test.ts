import { describe, it, expect } from "vitest";
import {
  setDocumentWorkspaces, setImageWorkspaces,
  FileNotFoundError, UnknownWorkspaceError,
} from "./membership";

// Fake db. Select calls are answered in order:
//   1st = the file-existence probe, 2nd = the workspace-existence probe.
// The transaction callback receives a tx that records deletes/inserts.
// Returns { db, deletes, inserts } rather than stashing the trackers on the db
// object itself, so callers get properly typed handles instead of casting db back.
function fakeDb(opts: { file?: { id: string } | null; foundWorkspaces?: { id: string }[] } = {}) {
  const deletes: unknown[] = [];
  const inserts: unknown[] = [];
  let selectCall = 0;
  const tx = {
    delete: () => ({ where: async (w: unknown) => { deletes.push(w); } }),
    insert: () => ({ values: (v: unknown) => ({ onConflictDoNothing: async () => { inserts.push(v); } }) }),
  };
  const db = {
    select: () => ({
      from: () => ({
        where: (_w: unknown) => {
          selectCall += 1;
          if (selectCall === 1) {
            const file = opts.file === null ? [] : [opts.file ?? { id: "f1" }];
            return { limit: async () => file };
          }
          return Promise.resolve(opts.foundWorkspaces ?? [{ id: "w1" }, { id: "w2" }]) as never;
        },
      }),
    }),
    transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  };
  // Deliberate: this fake only implements the Drizzle calls setDocumentWorkspaces
  // / setImageWorkspaces actually make, not the full `typeof defaultDb` surface —
  // `never` (not `any`) bridges it.
  return { db: db as never, deletes, inserts };
}

describe("setDocumentWorkspaces", () => {
  it("404s when the document does not exist", async () => {
    await expect(setDocumentWorkspaces("nope", ["w1"], fakeDb({ file: null }).db)).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("rejects an unknown workspace id before writing anything", async () => {
    const { db, deletes, inserts } = fakeDb({ foundWorkspaces: [{ id: "w1" }] }); // w2 missing
    await expect(setDocumentWorkspaces("f1", ["w1", "w2"], db)).rejects.toBeInstanceOf(UnknownWorkspaceError);
    expect(deletes).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("replaces the set: deletes the extras, inserts the members", async () => {
    const { db, deletes, inserts } = fakeDb();
    await setDocumentWorkspaces("f1", ["w1", "w2"], db);
    expect(deletes).toHaveLength(1);
    expect(inserts).toEqual([[
      { documentId: "f1", workspaceId: "w1" },
      { documentId: "f1", workspaceId: "w2" },
    ]]);
  });

  it("an empty set clears membership and inserts nothing (and skips the workspace probe)", async () => {
    const { db, deletes, inserts } = fakeDb();
    await setDocumentWorkspaces("f1", [], db);
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });
});

describe("setImageWorkspaces", () => {
  it("404s when the image does not exist", async () => {
    await expect(setImageWorkspaces("nope", ["w1"], fakeDb({ file: null }).db)).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("inserts image membership rows", async () => {
    const { db, inserts } = fakeDb();
    await setImageWorkspaces("i1", ["w1"], db);
    expect(inserts).toEqual([[{ imageId: "i1", workspaceId: "w1" }]]);
  });
});
