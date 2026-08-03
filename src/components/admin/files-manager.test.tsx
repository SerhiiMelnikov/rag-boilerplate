// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { FilesManager } from "./files-manager";

const FILES = [
  { id: "d1", kind: "document", filename: "report.pdf", ext: "pdf", status: "ready", error: null, caption: null, createdAt: "2026-01-02T00:00:00Z", workspaces: [{ id: "w1", name: "General", isDefault: true }] },
  { id: "i1", kind: "image", filename: "bike.png", ext: "png", status: "ready", error: null, caption: "a red bicycle", createdAt: "2026-01-01T00:00:00Z", workspaces: [] },
];
// 60 rows, not 25: at 25 the clamp inside paginate() makes "page 3 of ten" and
// "page 1 of fifty" the same screen, so the page-size reset test below passed
// with the reset deleted. Sixty gives fifty-per-page a real second page.
const PAGED_FILES = Array.from({ length: 60 }, (_, i) => ({
  id: `p${i}`, kind: "document", filename: `paged${String(i).padStart(2, "0")}.pdf`, ext: "pdf",
  status: "ready", error: null, caption: null,
  // Distinct and ordered without overflowing a month.
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
  workspaces: [{ id: "w1", name: "General", isDefault: true }],
}));

const WORKSPACES = [
  { id: "w1", name: "General", description: null, isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  { id: "w2", name: "Marketing", description: null, isDefault: false, createdAt: "2026-01-02T00:00:00Z" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ files: FILES, workspaces: WORKSPACES }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("FilesManager", () => {
  it("lists documents + images together", async () => {
    render(<FilesManager />);
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("bike.png")).toBeInTheDocument();
  });

  it("filters by extension", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.click(screen.getByLabelText("Filter by type")); // open the styled listbox
    fireEvent.click(await screen.findByRole("option", { name: "png" }));
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("bike.png")).toBeInTheDocument();
  });

  it("opens the modal when an image row is clicked", async () => {
    render(<FilesManager />);
    fireEvent.click(await screen.findByText("bike.png"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /bike\.png/ })).toBeInTheDocument());
  });

  it("renders workspace chips and an unassigned badge", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    // Scoped to the table: the header's "Upload to" control also legitimately
    // shows "General" once the default workspace is preselected.
    const table = screen.getByRole("table");
    expect(await within(table).findByText("General")).toBeInTheDocument();
    expect(within(table).getByText("unassigned")).toBeInTheDocument();
  });

  it("opens the workspaces modal from the chips cell", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.click(screen.getByLabelText("Edit workspaces of report.pdf"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Workspaces for report\.pdf/ })).toBeInTheDocument());
  });

  it("opens the chunks modal from the per-document action", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.click(screen.getByLabelText("View chunks of report.pdf"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Chunks for report\.pdf/ })).toBeInTheDocument());
  });

  it("does not offer a chunks action for images", async () => {
    render(<FilesManager />);
    await screen.findByText("bike.png");
    expect(screen.queryByLabelText("View chunks of bike.png")).not.toBeInTheDocument();
  });

  it("posts the selected workspaceIds with the upload", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    const input = screen.getByLabelText("Upload file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "n.md", { type: "text/markdown" })] } });
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const post = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      const body = (post![1] as { body: FormData }).body;
      expect(body.getAll("workspaceIds")).toEqual(["w1"]); // General preselected
    });
  });

  it("filters the list to unassigned files", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.click(screen.getByLabelText("Filter by workspace"));
    fireEvent.click(await screen.findByRole("option", { name: "unassigned" }));
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument(); // in General
    expect(screen.getByText("bike.png")).toBeInTheDocument();          // unassigned
  });

  it("ingests a URL and refreshes the list", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    const input = screen.getByLabelText("Ingest from URL");
    fireEvent.change(input, { target: { value: "https://example.com/article" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingest URL" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const post = calls.find((c) => c[0] === "/api/admin/documents/url");
      expect(post).toBeDefined();
      const init = post![1] as { method?: string; body?: string };
      expect(init.method).toBe("POST");
      // General is preselected by default, so it rides along even though this
      // test never touches "Upload to" — see the dedicated test below for a
      // chosen (non-default) workspace actually being honoured.
      expect(JSON.parse(init.body!)).toEqual({ url: "https://example.com/article", workspaceIds: ["w1"] });
    });
    // Cleared on success, and the list is reloaded (same endpoint the initial mount used).
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.filter((c) => c[0] === "/api/admin/files").length).toBeGreaterThanOrEqual(2);
  });

  // The handler being correct is worth nothing if the client never sends the
  // field: prove the "Upload to" selection actually leaves the browser on a
  // URL ingest, not just on a file upload.
  it("sends the chosen upload workspaces with an ingested URL", async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return String(url).includes("workspaces")
        ? { ok: true, json: async () => ({ workspaces: WORKSPACES }) }
        : { ok: true, json: async () => ({ files: [] }) };
    }) as unknown as typeof fetch;

    render(<FilesManager />);
    const trigger = await screen.findByLabelText("Workspaces for upload");
    // Wait for the default (General) to land before touching the control, so the
    // deselect click below has something deterministic to act on.
    await waitFor(() => expect(trigger).toHaveTextContent("General"));
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: /General/ })); // deselect the default
    fireEvent.click(screen.getByRole("option", { name: "Marketing" })); // choose Marketing instead
    fireEvent.click(trigger); // close the listbox — while open it is modal, and the URL form sits outside it
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());

    fireEvent.change(screen.getByLabelText("Ingest from URL"), { target: { value: "https://example.com/a" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingest URL" }));

    const posted = await waitFor(() => calls.find((c) => c.url.includes("/documents/url"))!);
    expect(posted.body).toMatchObject({ url: "https://example.com/a", workspaceIds: ["w2"] });
  });

  it("shows an error when the URL cannot be ingested", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/admin/documents/url") {
          return { ok: false, status: 400, json: async () => ({ error: "url is required" }) };
        }
        return { ok: true, status: 200, json: async () => ({ files: FILES, workspaces: WORKSPACES }) };
      }) as never,
    );
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.change(screen.getByLabelText("Ingest from URL"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingest URL" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("url is required");
  });

  it("disables the Ingest URL button until a URL is entered", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    expect(screen.getByRole("button", { name: "Ingest URL" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ingest from URL"), { target: { value: "https://example.com" } });
    expect(screen.getByRole("button", { name: "Ingest URL" })).toBeEnabled();
  });

  // Upload and Ingest are actions; type and workspace are filters; and
  // "Upload to" is a parameter of the upload, not a third filter.
  //
  // Two halves, because the first alone is not the claim the name makes. "Not in
  // the filter bar" would still pass if the actions had been relocated to some
  // third place; what matters is that they sit with the title.
  it("puts the actions in the page header, not the filter bar", async () => {
    render(<FilesManager />);
    const upload = await screen.findByLabelText("Upload file");
    const bar = screen.getByLabelText("Filter by type").closest("[data-testid='files-filters']");
    expect(bar).not.toBeNull();
    expect(screen.getByTestId("page-actions").contains(upload)).toBe(true);
    expect(bar!.contains(upload)).toBe(false);
  });

  // Before the actions row learned to wrap (see the "wraps instead of
  // overflowing" test below and PageHeader itself), a toolbar wide enough to
  // include the URL form pushed the header past the viewport and scrolled the
  // whole page sideways on mobile. Wrapping fixed the overflow, but the URL
  // form still belongs in its own row: it is a second, independent way to add
  // a file, not one more upload-parameter beside "Upload to" — proved here by
  // checking BOTH places it must not be, since "not in page-actions" alone
  // would still pass if it had been dropped into files-filters instead.
  it("keeps the URL form out of the header actions and out of the filter bar", async () => {
    render(<FilesManager />);
    const upload = await screen.findByLabelText("Upload file");
    const urlInput = screen.getByLabelText("Ingest from URL");
    const actions = screen.getByTestId("page-actions");
    const filters = screen.getByTestId("files-filters");

    expect(actions.contains(upload)).toBe(true);
    expect(actions.contains(urlInput)).toBe(false);
    expect(filters.contains(urlInput)).toBe(false);
  });

  // jsdom does not lay out flexbox, so this cannot assert "no horizontal
  // overflow" the way a real viewport would -- it only guards the class list
  // that produces that layout in a real browser. The actual layout claim (no
  // overflow at 375px/320px with a long default-workspace name) is verified
  // by a headless-Chromium measurement done when the fix landed (+49px overflow at
  // 375px and +104px at 320px before, zero at both after, with a long
  // default-workspace name in "Upload to"); this test only catches someone
  // deleting the classes that measurement depends on.
  it("wraps instead of overflowing: the actions row and the Upload-to control both carry their layout classes", async () => {
    render(<FilesManager />);
    const upload = await screen.findByLabelText("Upload file");
    // The actual flex-wrap container is this inner div (the one FilesManager
    // passes as PageHeader's `actions`), not page-actions itself -- see
    // files-manager.tsx and the comment on PageHeader's own wrapper.
    const actionsRow = upload.closest("div.flex.items-center.gap-2")!;
    expect(actionsRow.className).toContain("flex-wrap");
    expect(actionsRow.className).toContain("justify-end");

    const multiSelectRoot = screen.getByLabelText("Workspaces for upload").closest(".relative")!;
    expect(multiSelectRoot.className).toContain("min-w-36");
    expect(multiSelectRoot.className).toContain("max-w-40");
  });

  it("finds a file by name", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "report" } });
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.queryByText("bike.png")).toBeNull();
  });

  it("searches by name regardless of case", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "REPORT" } });
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  // Without this an admin cannot tell a short list from a filtered one.
  it("says how many rows the filters are hiding", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "report" } });
    expect(screen.getByText("1 of 2 files")).toBeInTheDocument();
  });

  it("does not show a count when nothing is filtered", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  // "1 files" is wrong.
  it("uses the singular for exactly one file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("workspaces")
        ? { ok: true, status: 200, json: async () => ({ workspaces: [] }) }
        : { ok: true, status: 200, json: async () => ({ files: [FILES[0]] }) })) as never,
    );
    render(<FilesManager />);
    expect(await screen.findByText("1 file")).toBeInTheDocument();
    expect(screen.queryByText("1 files")).toBeNull();
  });

  // The two cases mean different things and deserve different offers. Conflating
  // them is the common bug: "upload your first file" is nonsense in front of an
  // admin who has fifty files and a typo in the search box.
  it("invites the first upload when nothing has been added", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("workspaces")
        ? { ok: true, status: 200, json: async () => ({ workspaces: [] }) }
        : { ok: true, status: 200, json: async () => ({ files: [] }) })) as never,
    );
    render(<FilesManager />);
    expect(await screen.findByText("No files yet")).toBeInTheDocument();
    expect(screen.queryByText("No files match")).toBeNull();
  });

  // A virgin install has nothing to filter; offering to filter an empty table is
  // clutter, and it primes the very "No files match" empty state (with its own
  // "Clear filters" offer) that a genuinely empty library must never show.
  it("hides the filter bar once the load resolves to zero files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("workspaces")
        ? { ok: true, status: 200, json: async () => ({ workspaces: [] }) }
        : { ok: true, status: 200, json: async () => ({ files: [] }) })) as never,
    );
    render(<FilesManager />);
    await screen.findByText("No files yet");
    expect(screen.queryByTestId("files-filters")).toBeNull();
  });

  describe("initial load", () => {
    // The default fetch mock in beforeEach resolves on a microtask, so the
    // assertions below — made with no `await` in between — run before that
    // resolution has had a chance to land, i.e. exactly the state React paints
    // on first render.
    it("does not claim the library is empty before the fetch resolves", async () => {
      render(<FilesManager />);
      expect(screen.queryByText("No files yet")).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
      // Drain the pending fetch inside this test (rather than leaving it to
      // resolve, unawaited, into whatever test runs next).
      await screen.findByText("report.pdf");
    });

    it("shows the real list once the fetch resolves", async () => {
      render(<FilesManager />);
      expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    });

    // A failed load must say so, not sit there silently claiming (via the
    // now-unblocked empty state) that the library has nothing in it.
    it("surfaces a failed load instead of swallowing it", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as never);
      render(<FilesManager />);
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the files. Try again.");
      expect(screen.queryByText("No files yet")).toBeNull();
    });
  });

  it("offers to clear the filters when they matched nothing", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "zzzz" } });
    expect(screen.getByText("No files match")).toBeInTheDocument();
    expect(screen.queryByText("No files yet")).toBeNull();
  });

  // The first alone is not the claim the name makes (same discipline as the
  // header-placement test above): a row can reappear because one filter cleared
  // while another silently did not, if the remaining filter happens to match. So
  // all three filters are driven off "all"/"" first, and all three are asserted
  // back afterward — not just that rows came back.
  it("clears every filter from the empty state, not just the search", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");

    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "zzzz" } });

    fireEvent.click(screen.getByLabelText("Filter by type")); // open the styled listbox
    fireEvent.click(await screen.findByRole("option", { name: "png" }));

    fireEvent.click(screen.getByLabelText("Filter by workspace"));
    fireEvent.click(await screen.findByRole("option", { name: "unassigned" }));

    expect(await screen.findByText("No files match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("bike.png")).toBeInTheDocument();
    expect((screen.getByLabelText("Search files") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Filter by type")).toHaveTextContent("all");
    expect(screen.getByLabelText("Filter by workspace")).toHaveTextContent("all");
  });

  describe("pagination", () => {
    beforeEach(() => {
      global.fetch = vi.fn(async (url: string) => (String(url).includes("workspaces")
        ? { ok: true, json: async () => ({ workspaces: WORKSPACES }) }
        : { ok: true, json: async () => ({ files: PAGED_FILES }) })) as unknown as typeof fetch;
    });

    it("renders one page of ten and says how far through the list it is", async () => {
      render(<FilesManager />);
      expect(await screen.findByText("paged59.pdf")).toBeInTheDocument();
      expect(screen.queryByText("paged49.pdf")).toBeNull();
      expect(screen.getByText("1–10 of 60 files")).toBeInTheDocument();
    });

    it("pages forward over the same list", async () => {
      render(<FilesManager />);
      fireEvent.click(await screen.findByLabelText("Next page"));
      expect(await screen.findByText("paged49.pdf")).toBeInTheDocument();
      expect(screen.queryByText("paged59.pdf")).toBeNull();
    });

    // Asking to see MORE must never land on an emptier screen. The second
    // assertion is the whole test: paged00 is the LAST row of the list, so it
    // is only on screen if the view stayed on page 2 after the size grew.
    it("returns to the first page when the page size grows", async () => {
      render(<FilesManager />);
      fireEvent.click(await screen.findByLabelText("Next page"));
      expect(await screen.findByText("paged49.pdf")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Rows per page"));
      fireEvent.click(await screen.findByRole("option", { name: "50" }));

      expect(await screen.findByText("paged59.pdf")).toBeInTheDocument();
      expect(screen.queryByText("paged00.pdf")).toBeNull();
      expect(screen.getByText("1–50 of 60 files")).toBeInTheDocument();
    });
  });
});
