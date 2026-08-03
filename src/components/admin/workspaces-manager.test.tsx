// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspacesManager, editIntent } from "./workspaces-manager";

const WORKSPACES = [
  { id: "w1", name: "General", description: null, isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  { id: "w2", name: "Marketing", description: "team space", isDefault: false, createdAt: "2026-01-02T00:00:00Z" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ workspaces: WORKSPACES, users: [] }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("WorkspacesManager", () => {
  it("lists workspaces and badges the default one", async () => {
    render(<WorkspacesManager />);
    expect(await screen.findByText("Marketing")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("does not offer delete for the General workspace", async () => {
    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
    expect(screen.queryByLabelText("Delete General")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Delete Marketing")).toBeInTheDocument();
  });

  it("creates a workspace", async () => {
    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
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
    await screen.findByText("Marketing");
    // The row is read-only until Edit is clicked — see the "edits a row only
    // after the admin asks to" smoke test below.
    fireEvent.click(screen.getByLabelText("Edit Marketing"));
    const name = screen.getByDisplayValue("Marketing");
    fireEvent.change(name, { target: { value: "Growth" } });
    fireEvent.click(screen.getByLabelText("Save Growth"));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patch = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(patch![0]).toBe("/api/admin/workspaces/w2");
    });
  });

  // A smoke test on purpose: the rule itself is covered exhaustively by the
  // editIntent cases below, and jsdom cannot exercise the unmount-blur path at all.
  it("edits a row only after the admin asks to", async () => {
    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
    expect(screen.queryByLabelText("Name of Marketing")).toBeNull();
    fireEvent.click(screen.getByLabelText("Edit Marketing"));
    expect(screen.getByLabelText("Name of Marketing")).toBeInTheDocument();
  });

  // Before this fix, commit() cleared editingId before the request and never
  // restored it on failure: the row went read-only, and the next click on Edit
  // re-seeded the draft from the (unchanged) stored name — silently discarding
  // whatever the admin had typed.
  it("reopens a row with the typed draft intact when the save is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) => {
        if (init?.method === "PATCH") {
          return { ok: false, status: 409, json: async () => ({ error: "A workspace with that name already exists." }) };
        }
        return { ok: true, status: 200, json: async () => ({ workspaces: WORKSPACES }) };
      }) as never,
    );

    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
    fireEvent.click(screen.getByLabelText("Edit Marketing"));
    fireEvent.change(screen.getByLabelText("Name of Marketing"), { target: { value: "Growth" } });
    fireEvent.click(screen.getByLabelText("Save Growth"));

    expect(await screen.findByRole("alert")).toHaveTextContent("A workspace with that name already exists.");
    // Still open, and still showing what was typed — not the row collapsed back
    // to read-only, and not the input re-seeded from the stored "Marketing".
    expect(screen.getByDisplayValue("Growth")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Marketing")).toBeNull();
  });

  // On a fresh install the default workspace is the only row, and every other
  // case here drives Marketing — whose Edit button hands focus to a name input.
  // The default row has no name input at all (its name is immutable, shown as
  // plain text), so without this fix, opening it focuses nothing.
  it("focuses the description input when opening the default row", async () => {
    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
    fireEvent.click(screen.getByLabelText("Edit General"));
    expect(screen.getByLabelText("Description of General")).toHaveFocus();
  });

  // Regression: onBlur was originally wired per-field, so moving focus from the name
  // input to the description input inside the SAME row committed prematurely — the
  // new name went out with the untouched, still-open description, and the row
  // collapsed before the admin could finish. One onBlur on the row (see the comment
  // on TR's onBlur in the component) fixes this: relatedTarget still inside the row
  // means the edit is not over.
  it("does not commit when focus moves from the name field to the description field in the same row", async () => {
    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
    fireEvent.click(screen.getByLabelText("Edit Marketing"));

    const name = screen.getByLabelText("Name of Marketing");
    const description = screen.getByLabelText("Description of Marketing");
    fireEvent.change(name, { target: { value: "Growth" } });

    // Tabbing from the name field to the description field: focus lands inside the
    // same row, so this must not be read as "the admin is done."
    fireEvent.blur(name, { relatedTarget: description });
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(
        (c) => (c[1] as { method?: string } | undefined)?.method === "PATCH",
      ),
    ).toBe(false);
    expect(screen.getByLabelText("Name of Marketing")).toBeInTheDocument();

    // Focus genuinely leaves the row: the commit fires exactly once, carrying the
    // renamed name together with the description as it stands (untouched here).
    fireEvent.blur(description, { relatedTarget: null });
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patches = calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(patches[0][0]).toBe("/api/admin/workspaces/w2");
      expect(JSON.parse((patches[0][1] as { body: string }).body)).toEqual({ name: "Growth", description: "team space" });
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
    await screen.findByText("Marketing");

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

  it("opens the access modal for a workspace", async () => {
    render(<WorkspacesManager />);
    await screen.findByText("Marketing");
    fireEvent.click(screen.getByLabelText("Manage access to Marketing"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Access to Marketing/ })).toBeInTheDocument());
  });
});

// The decision, isolated from the DOM. jsdom cannot fire the blur this guard
// exists for, so a wiring test would pass with or without it — see the comment
// on `settled` in the component.
describe("editIntent", () => {
  const current = { name: "Marketing", description: "Brand assets" };

  it("commits a changed name", () => {
    expect(editIntent({ name: "Sales", description: "Brand assets" }, current, { cancelled: false, nameLocked: false }))
      .toEqual({ kind: "commit", name: "Sales", description: "Brand assets" });
  });

  it("commits a changed description", () => {
    expect(editIntent({ name: "Marketing", description: "Logos only" }, current, { cancelled: false, nameLocked: false }))
      .toEqual({ kind: "commit", name: "Marketing", description: "Logos only" });
  });

  it("abandons when nothing changed", () => {
    expect(editIntent({ name: "Marketing", description: "Brand assets" }, current, { cancelled: false, nameLocked: false }))
      .toEqual({ kind: "abandon" });
  });

  it("abandons on Escape even when the draft differs", () => {
    expect(editIntent({ name: "Sales", description: "x" }, current, { cancelled: true, nameLocked: false }))
      .toEqual({ kind: "abandon" });
  });

  it("abandons an empty name rather than sending one the API rejects", () => {
    expect(editIntent({ name: "   ", description: "Brand assets" }, current, { cancelled: false, nameLocked: false }))
      .toEqual({ kind: "abandon" });
  });

  it("trims before comparing, so whitespace alone is not a change", () => {
    expect(editIntent({ name: "  Marketing  ", description: " Brand assets " }, current, { cancelled: false, nameLocked: false }))
      .toEqual({ kind: "abandon" });
  });

  // An emptied description clears the column; it must be null, never "".
  it("sends null for an emptied description", () => {
    expect(editIntent({ name: "Marketing", description: "  " }, current, { cancelled: false, nameLocked: false }))
      .toEqual({ kind: "commit", name: "Marketing", description: null });
  });

  // The default workspace's name is immutable, so the PATCH body must omit it
  // entirely rather than send the unchanged value back.
  it("omits the name when it is locked", () => {
    expect(editIntent({ name: "General", description: "Everything" }, { name: "General", description: null }, { cancelled: false, nameLocked: true }))
      .toEqual({ kind: "commit", name: null, description: "Everything" });
  });

  it("abandons a locked row whose description also did not change", () => {
    expect(editIntent({ name: "General", description: "" }, { name: "General", description: null }, { cancelled: false, nameLocked: true }))
      .toEqual({ kind: "abandon" });
  });
});
