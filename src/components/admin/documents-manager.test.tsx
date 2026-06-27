// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentsManager } from "@/components/admin/documents-manager";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/documents" && (!init || !init.method)) {
      return { ok: true, json: async () => ({ documents: [{ id: "d1", filename: "a.md", status: "ready", createdAt: new Date(0).toISOString() }] }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
});

describe("DocumentsManager", () => {
  it("lists documents", async () => {
    render(<DocumentsManager />);
    expect(await screen.findByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
  it("uploads a selected file", async () => {
    render(<DocumentsManager />);
    const file = new File(["hello"], "note.md", { type: "text/markdown" });
    await userEvent.upload(screen.getByLabelText(/upload/i), file);
    expect(fetch).toHaveBeenCalledWith("/api/admin/documents", expect.objectContaining({ method: "POST" }));
  });
});
