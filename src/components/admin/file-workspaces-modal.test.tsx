// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileWorkspacesModal } from "./file-workspaces-modal";

const WORKSPACES = [
  { id: "w1", name: "General", description: null, isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  { id: "w2", name: "Marketing", description: null, isDefault: false, createdAt: "2026-01-02T00:00:00Z" },
];
const file = { id: "d1", kind: "document" as const, filename: "report.pdf", workspaces: [{ id: "w1", name: "General", isDefault: true }] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ workspaces: WORKSPACES }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("FileWorkspacesModal", () => {
  it("checks the workspaces the file already belongs to, General first with a hint", async () => {
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByLabelText("General")).toBeChecked();
    expect(screen.getByLabelText("Marketing")).not.toBeChecked();
    expect(screen.getByText("everyone")).toBeInTheDocument();
  });

  it("PUTs the checked set on save", async () => {
    const onSaved = vi.fn();
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.click(await screen.findByLabelText("Marketing"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
      expect(put![0]).toBe("/api/admin/files/document/d1/workspaces");
      expect(JSON.parse((put![1] as { body: string }).body)).toEqual({ workspaceIds: ["w1", "w2"] });
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("allows unchecking everything (unassigned)", async () => {
    render(<FileWorkspacesModal file={file} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByLabelText("General"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
      expect(JSON.parse((put![1] as { body: string }).body)).toEqual({ workspaceIds: [] });
    });
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<FileWorkspacesModal file={file} onClose={onClose} onSaved={() => {}} />);
    await screen.findByLabelText("General");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
