// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileWorkspacesModal } from "./file-workspaces-modal";

const WORKSPACES = [
  { id: "w1", name: "General", description: null, isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  { id: "w2", name: "Marketing", description: null, isDefault: false, createdAt: "2026-01-02T00:00:00Z" },
];
const file = { id: "d1", kind: "document" as const, filename: "report.pdf", workspaces: [{ id: "w1", name: "General", isDefault: true }] };

const putBody = () => {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
  return { url: put![0], body: JSON.parse((put![1] as { body: string }).body) as { workspaceIds: string[] } };
};

// The picker is a listbox, not a row of checkboxes: open it, click an option, then
// close it again. The close matters — Headless UI v2's ListboxOptions is modal by
// default, so while it is open the rest of the dialog (Save included) is inert and
// unreachable, exactly as it would be for a real user.
const pick = async (name: string) => {
  const trigger = screen.getByLabelText("Add to workspace");
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ workspaces: WORKSPACES }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("FileWorkspacesModal", () => {
  // Replaces "checks the workspaces the file already belongs to": the state is now
  // shown as chips rather than ticks, and what it proves is the same — the file's
  // current workspaces are pre-selected and nothing else is.
  it("shows the file's current workspaces as chips, and no others", async () => {
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByLabelText("Remove from General")).toBeInTheDocument();
    expect(screen.queryByLabelText("Remove from Marketing")).toBeNull();
  });

  it("PUTs the chosen set on save", async () => {
    const onSaved = vi.fn();
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={onSaved} />);
    await screen.findByLabelText("Remove from General");
    await pick("Marketing");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const { url, body } = putBody();
      expect(url).toBe("/api/admin/files/document/d1/workspaces");
      // Server order, not click order — the request has to be deterministic.
      expect(body).toEqual({ workspaceIds: ["w1", "w2"] });
      expect(onSaved).toHaveBeenCalled();
    });
  });

  // A chip's own remove button is the reason the picker was worth changing: taking
  // one back should not mean hunting for its row again.
  it("removes a workspace from its chip", async () => {
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Remove from General"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody().body).toEqual({ workspaceIds: [] }));
  });

  // A file in no workspace is a real state, not an error — it stays listed and is
  // simply never retrieved. Saying so is the point; an empty area is not.
  it("says what an empty selection means", async () => {
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Remove from General"));
    expect(screen.getByText(/no question will ever reach it/i)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<FileWorkspacesModal file={file} onClose={onClose} onSaved={() => {}} />);
    await screen.findByLabelText("Remove from General");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
