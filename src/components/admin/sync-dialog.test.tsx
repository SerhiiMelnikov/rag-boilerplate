// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncDialog } from "./sync-dialog";

const plan = { add: ["/d/new.md"], update: [], delete: ["/d/gone.md"], dirs: ["/d"], errors: [] };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/preview")) return jsonResponse(plan);
      if (u.endsWith("/apply")) return jsonResponse({ added: 1, updated: 0, deleted: 1 });
      throw new Error(`unexpected fetch ${u}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("SyncDialog", () => {
  it("previews, gates Apply on delete confirmation, then applies", async () => {
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(<SyncDialog open onClose={onClose} onApplied={onApplied} />);

    // Preview renders the add + delete paths.
    await waitFor(() => expect(screen.getByText("/d/new.md")).toBeInTheDocument());
    expect(screen.getByText("/d/gone.md")).toBeInTheDocument();

    // Deletes present but unconfirmed → Apply is disabled.
    const apply = screen.getByRole("button", { name: /apply/i });
    expect(apply).toBeDisabled();

    // Confirming the deletion enables Apply.
    fireEvent.click(screen.getByLabelText(/document.*will be deleted/i));
    expect(apply).toBeEnabled();

    // Apply POSTs the previewed plan to the apply endpoint, then refreshes + closes.
    fireEvent.click(apply);
    await waitFor(() =>
      expect(globalThis.fetch as unknown as Mock).toHaveBeenCalledWith(
        "/api/admin/documents/sync/apply",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ add: plan.add, update: plan.update, delete: plan.delete }),
        }),
      ),
    );
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows no confirmation checkbox and an enabled Apply when nothing is deleted", async () => {
    (globalThis.fetch as unknown as Mock).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/preview")) return jsonResponse({ ...plan, delete: [] });
      return jsonResponse({ added: 1, updated: 0, deleted: 0 });
    });
    render(<SyncDialog open onClose={() => {}} onApplied={() => {}} />);
    await waitFor(() => expect(screen.getByText("/d/new.md")).toBeInTheDocument());
    expect(screen.queryByLabelText(/will be deleted/i)).toBeNull();
    expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
  });

  it("surfaces a 409 empty-dirs preview error", async () => {
    (globalThis.fetch as unknown as Mock).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/preview")) return jsonResponse({ error: "No documents directories are configured." }, 409);
      return jsonResponse({});
    });
    render(<SyncDialog open onClose={() => {}} onApplied={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No documents directories are configured.");
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
  });
});
