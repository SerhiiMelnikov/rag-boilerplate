// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { UsersManager } from "@/components/admin/users-manager";

const USERS = [
  { id: "s", email: "super@x", role: "admin", isSuperAdmin: true, blockedAt: null },
  { id: "u1", email: "user@x", role: "user", isSuperAdmin: false, blockedAt: null },
  { id: "me", email: "me@corp.com", role: "user", isSuperAdmin: false, blockedAt: null },
  { id: "b1", email: "bob@corp.com", role: "user", isSuperAdmin: false, blockedAt: null },
  { id: "b2", email: "carol@corp.com", role: "user", isSuperAdmin: false, blockedAt: "2024-01-01T00:00:00.000Z" },
];

const MANY_USERS = Array.from({ length: 9 }, (_, i) => ({
  id: `u${i}`, email: `user${i}@corp.com`, role: "user" as const, isSuperAdmin: false, blockedAt: null,
}));

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

  // Rule 4. Blocking is the most consequential thing on this screen and took one
  // click with no confirmation.
  it("asks before blocking someone, and sends nothing if the admin cancels", async () => {
    render(<UsersManager currentUserId="me" />);
    fireEvent.click(await screen.findByLabelText("Block bob@corp.com"));
    expect(await screen.findByText(/Block bob@corp\.com\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/Block bob@corp\.com\?/)).toBeNull());
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH")).toBe(false);
  });

  it("blocks on confirm", async () => {
    render(<UsersManager currentUserId="me" />);
    fireEvent.click(await screen.findByLabelText("Block bob@corp.com"));
    fireEvent.click(await screen.findByRole("button", { name: "Block" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patch = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(JSON.parse((patch![1] as { body: string }).body)).toEqual({ blocked: true });
    });
  });

  // Unblocking restores access rather than removing it, so — unlike blocking —
  // it must never route through the confirmation dialog.
  it("unblocks immediately, with no confirmation", async () => {
    render(<UsersManager currentUserId="me" />);
    fireEvent.click(await screen.findByLabelText("Unblock carol@corp.com"));
    // The dialog's title is always "Block {email}?" (it only ever exists for the
    // block flow), so its absence here proves unblock did not route through it.
    expect(screen.queryByText(/Block carol@corp\.com\?/)).toBeNull();
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patch = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(JSON.parse((patch![1] as { body: string }).body)).toEqual({ blocked: false });
    });
  });

  // A role change is reversible in one click, so it does not earn a dialog —
  // but it must not be a full-width button competing with the person's name.
  it("changes a role without a confirmation", async () => {
    render(<UsersManager currentUserId="me" />);
    fireEvent.click(await screen.findByLabelText("Make bob@corp.com an admin"));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patch = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(JSON.parse((patch![1] as { body: string }).body)).toEqual({ role: "admin" });
    });
  });

  // The row already had no actions; nothing said why, so it read as broken.
  it("marks your own row instead of just leaving it empty", async () => {
    render(<UsersManager currentUserId="me" />);
    expect(await screen.findByText("you")).toBeInTheDocument();
  });

  it("surfaces a rejected change instead of doing nothing", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PATCH"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => ({ users: USERS }) })) as unknown as typeof fetch;
    render(<UsersManager currentUserId="me" />);
    fireEvent.click(await screen.findByLabelText("Make bob@corp.com an admin"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not/i);
  });

  it("invites the first person when the list is empty", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: [] }) })) as unknown as typeof fetch;
    render(<UsersManager currentUserId="me" />);
    expect(await screen.findByText("No accounts yet")).toBeInTheDocument();
  });

  // Same threshold as the conversation list: a box that appears on a short list is
  // clutter, and one that never appears on a long list is a missing feature. The
  // boundary that matters is 8 → 7, not 9 → 8.
  it("offers search once there are eight accounts, and not at seven", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: MANY_USERS.slice(0, 8) }) })) as unknown as typeof fetch;
    const { unmount } = render(<UsersManager currentUserId="me" />);
    expect(await screen.findByLabelText("Search accounts")).toBeInTheDocument();
    unmount();

    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: MANY_USERS.slice(0, 7) }) })) as unknown as typeof fetch;
    render(<UsersManager currentUserId="me" />);
    await screen.findByText(MANY_USERS[0].email);
    expect(screen.queryByLabelText("Search accounts")).toBeNull();
  });

  it("filters by email", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: MANY_USERS }) })) as unknown as typeof fetch;
    render(<UsersManager currentUserId="me" />);
    fireEvent.change(await screen.findByLabelText("Search accounts"), { target: { value: "user3" } });
    expect(screen.getByText("user3@corp.com")).toBeInTheDocument();
    expect(screen.queryByText("user4@corp.com")).toBeNull();
  });

  // A filter that matches nothing is not the same as an empty account list, and
  // offering "add your first person" there would be nonsense.
  it("distinguishes a filter that matched nothing from an empty list", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ users: MANY_USERS }) })) as unknown as typeof fetch;
    render(<UsersManager currentUserId="me" />);
    fireEvent.change(await screen.findByLabelText("Search accounts"), { target: { value: "nobody" } });
    expect(screen.getByText("No accounts match")).toBeInTheDocument();
    expect(screen.queryByText("No accounts yet")).toBeNull();
  });

  // `visible` already gates filtering behind `searchable &&`, so a box that has
  // disappeared can never leave the list invisibly filtered — that hazard from
  // conversation-list.tsx does not apply here. What the clearing effect actually
  // guards against: a query typed while searchable, left behind when the list
  // drops under the threshold, must not silently re-apply the moment the count
  // climbs back over it in the same mounted session.
  it("does not let a stale query silently re-apply once the list grows past the threshold again", async () => {
    let getCalls = 0;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
      getCalls += 1;
      if (getCalls === 1) return { ok: true, json: async () => ({ users: MANY_USERS }) }; // 9 rows: searchable
      if (getCalls === 2) return { ok: true, json: async () => ({ users: MANY_USERS.slice(0, 5) }) }; // 5 rows: not searchable
      return { ok: true, json: async () => ({ users: MANY_USERS }) }; // back to 9 rows: searchable again
    }) as unknown as typeof fetch;

    render(<UsersManager currentUserId="me" />);
    fireEvent.change(await screen.findByLabelText("Search accounts"), { target: { value: "user3" } });
    expect(screen.getByText("user3@corp.com")).toBeInTheDocument();

    // Any change reaches load(); drive one so the next GET drops the list under
    // the threshold and the search box disappears.
    fireEvent.click(await screen.findByLabelText("Make user3@corp.com an admin"));
    await waitFor(() => expect(screen.queryByLabelText("Search accounts")).toBeNull());

    // Drive another change so the list climbs back over the threshold.
    fireEvent.click(await screen.findByLabelText("Make user0@corp.com an admin"));

    // If the effect were missing, the box would reappear pre-filled with "user3"
    // and instantly re-filter a list the admin can now see again.
    await waitFor(() => expect(screen.getByLabelText("Search accounts")).toHaveValue(""));
  });
});
