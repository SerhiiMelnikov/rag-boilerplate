// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceAccessModal } from "./workspace-access-modal";

const USERS = [
  { id: "u1", email: "a@x.com", granted: true },
  { id: "u2", email: "b@x.com", granted: false },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ users: USERS }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

const marketing = { id: "w2", name: "Marketing", isDefault: false };

describe("WorkspaceAccessModal", () => {
  it("lists users with their grant state", async () => {
    render(<WorkspaceAccessModal workspace={marketing} onClose={() => {}} />);
    expect(await screen.findByLabelText("a@x.com")).toBeChecked();
    expect(screen.getByLabelText("b@x.com")).not.toBeChecked();
  });

  it("PUTs the grant when a checkbox is toggled", async () => {
    render(<WorkspaceAccessModal workspace={marketing} onClose={() => {}} />);
    fireEvent.click(await screen.findByLabelText("b@x.com"));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
      expect(put![0]).toBe("/api/admin/workspaces/w2/users");
      expect(JSON.parse((put![1] as { body: string }).body)).toEqual({ userId: "u2", granted: true });
    });
  });

  it("disables editing for the default workspace and explains why", async () => {
    render(<WorkspaceAccessModal workspace={{ id: "w1", name: "General", isDefault: true }} onClose={() => {}} />);
    expect(await screen.findByLabelText("a@x.com")).toBeDisabled();
    expect(screen.getByText(/everyone has access/i)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<WorkspaceAccessModal workspace={marketing} onClose={onClose} />);
    await screen.findByLabelText("a@x.com");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
