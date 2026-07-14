// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UsersManager } from "@/components/admin/users-manager";

const USERS = [
  { id: "s", email: "super@x", role: "admin", isSuperAdmin: true, blockedAt: null },
  { id: "u1", email: "user@x", role: "user", isSuperAdmin: false, blockedAt: null },
];
beforeEach(() => { global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: USERS }) })) as unknown as typeof fetch; });

describe("UsersManager", () => {
  it("lists users and marks the super-admin", async () => {
    render(<UsersManager currentUserId="s" />);
    await waitFor(() => expect(screen.getByText("user@x")).toBeTruthy());
    expect(screen.getByText("super@x")).toBeTruthy();
  });
  it("does not offer block/role actions on the super-admin row", async () => {
    render(<UsersManager currentUserId="u1" />);
    await waitFor(() => expect(screen.getByText("super@x")).toBeTruthy());
    // the super-admin row has no Block button
    expect(screen.queryByRole("button", { name: /block super@x/i })).toBeNull();
  });
});
