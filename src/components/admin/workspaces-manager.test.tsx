// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspacesManager } from "./workspaces-manager";

const WORKSPACES = [
  { id: "w1", name: "General", description: null, isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  { id: "w2", name: "Marketing", description: "team space", isDefault: false, createdAt: "2026-01-02T00:00:00Z" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ workspaces: WORKSPACES }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("WorkspacesManager", () => {
  it("lists workspaces and badges the default one", async () => {
    render(<WorkspacesManager />);
    expect(await screen.findByDisplayValue("Marketing")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("does not offer delete for the General workspace", async () => {
    render(<WorkspacesManager />);
    await screen.findByDisplayValue("Marketing");
    expect(screen.queryByLabelText("Delete General")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Delete Marketing")).toBeInTheDocument();
  });

  it("creates a workspace", async () => {
    render(<WorkspacesManager />);
    await screen.findByDisplayValue("Marketing");
    fireEvent.change(screen.getByLabelText("New workspace name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const post = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      expect(post).toBeTruthy();
      // an empty description is omitted, never sent as ""
      expect(JSON.parse((post![1] as { body: string }).body)).toEqual({ name: "Sales" });
    });
  });

  it("saves a renamed workspace", async () => {
    render(<WorkspacesManager />);
    const name = await screen.findByDisplayValue("Marketing");
    fireEvent.change(name, { target: { value: "Growth" } });
    fireEvent.click(screen.getByLabelText("Save Growth"));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patch = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(patch![0]).toBe("/api/admin/workspaces/w2");
    });
  });

  it("clears a stale error banner once a subsequent delete succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) => {
        // The create request 409s (duplicate name) so an error banner appears first.
        if (init?.method === "POST") {
          return { ok: false, status: 409, json: async () => ({ error: "A workspace with that name already exists." }) };
        }
        // The delete request that follows succeeds.
        if (init?.method === "DELETE") {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ workspaces: WORKSPACES }) };
      }) as never,
    );

    render(<WorkspacesManager />);
    await screen.findByDisplayValue("Marketing");

    // Trigger the create failure that leaves an error banner on screen.
    fireEvent.change(screen.getByLabelText("New workspace name"), { target: { value: "General" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A workspace with that name already exists.");

    // Delete a workspace successfully; the stale error banner must not survive.
    fireEvent.click(screen.getByLabelText("Delete Marketing"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    // Query with { hidden: true }: while the confirm dialog is open (and during its
    // jsdom-never-completing leave transition), Headless UI marks the rest of the
    // page aria-hidden, which would otherwise hide the banner from role queries
    // regardless of whether the error state was actually cleared.
    await waitFor(() => expect(screen.queryByRole("alert", { hidden: true })).not.toBeInTheDocument());
  });
});
