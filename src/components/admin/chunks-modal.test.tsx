// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChunksModal } from "./chunks-modal";

const doc = { id: "d1", filename: "report.pdf" };

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function stubFetch(byOffset: Record<number, { rows: unknown[]; total: number }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://x");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const page = byOffset[offset];
    if (!page) throw new Error(`unexpected offset ${offset}`);
    return jsonResponse(page);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("ChunksModal", () => {
  it("renders position, character count, and content for each row", async () => {
    vi.stubGlobal("fetch", stubFetch({
      0: { rows: [{ chunkIndex: 0, content: "hello world", contentHash: "h1" }], total: 1 },
    }) as never);
    render(<ChunksModal doc={doc} onClose={() => {}} />);

    expect(await screen.findByText("hello world")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // position
    expect(screen.getByText("11")).toBeInTheDocument(); // "hello world".length
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();
  });

  it("says the order is unknown for a legacy chunk instead of numbering it", async () => {
    vi.stubGlobal("fetch", stubFetch({
      0: {
        rows: [
          { chunkIndex: null, content: "legacy chunk", contentHash: "h2" },
          { chunkIndex: null, content: "another legacy chunk", contentHash: "h3" },
        ],
        total: 2,
      },
    }) as never);
    render(<ChunksModal doc={doc} onClose={() => {}} />);

    await screen.findByText("legacy chunk");
    // Both rows say "Unknown" rather than being numbered 1 and 2.
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByText(/order unknown/i)).toBeInTheDocument();
  });

  it("shows an explicit empty message rather than an empty table", async () => {
    vi.stubGlobal("fetch", stubFetch({ 0: { rows: [], total: 0 } }) as never);
    render(<ChunksModal doc={doc} onClose={() => {}} />);

    expect(await screen.findByText(/this document has no chunks yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("pages forward and back against limit/offset", async () => {
    const fetchMock = stubFetch({
      0: { rows: [{ chunkIndex: 0, content: "page one chunk", contentHash: "h1" }], total: 2 },
      50: { rows: [{ chunkIndex: 1, content: "page two chunk", contentHash: "h2" }], total: 2 },
    });
    vi.stubGlobal("fetch", fetchMock as never);
    render(<ChunksModal doc={doc} onClose={() => {}} />);

    await screen.findByText("page one chunk");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("page two chunk");
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("limit=50&offset=50"));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled(); // 50 + 1 >= total(2)

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("page one chunk");
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("offset=0"));
  });

  it("closes on Escape", async () => {
    vi.stubGlobal("fetch", stubFetch({ 0: { rows: [], total: 0 } }) as never);
    const onClose = vi.fn();
    render(<ChunksModal doc={doc} onClose={onClose} />);
    await screen.findByText(/no chunks yet/i);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  // Was a backdrop-click test against this modal's own hand-rolled panel. It now
  // uses the shared Dialog, so dismissal is Headless UI's — Escape and outside
  // click both, with a focus trap neither existed before. Escape is what the other
  // modals' tests drive, and it is the half jsdom can exercise honestly.
  it("closes on Escape, and stays open while the panel is used", async () => {
    vi.stubGlobal("fetch", stubFetch({ 0: { rows: [], total: 0 } }) as never);
    const onClose = vi.fn();
    render(<ChunksModal doc={doc} onClose={onClose} />);
    await screen.findByText(/no chunks yet/i);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
