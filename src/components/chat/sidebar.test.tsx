// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/chat/sidebar";

beforeEach(() => vi.restoreAllMocks());

function mockFetchList(list: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/conversations" && (!init || init.method === undefined)) {
      return { ok: true, json: async () => ({ conversations: list }) };
    }
    if (url === "/api/conversations" && init?.method === "POST") {
      return { ok: true, json: async () => ({ id: "new1", title: "New conversation" }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
}

describe("Sidebar", () => {
  it("renders conversations and fires onNew after creating", async () => {
    mockFetchList([{ id: "c1", title: "First", createdAt: new Date(0).toISOString() }]);
    const onNew = vi.fn();
    render(<Sidebar activeId="c1" onSelect={vi.fn()} onNew={onNew} />);
    expect(await screen.findByText("First")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNew).toHaveBeenCalledWith("new1");
  });
});
