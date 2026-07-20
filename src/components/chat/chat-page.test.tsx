// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPage } from "@/components/chat/chat-page";

beforeEach(() => vi.restoreAllMocks());

// ChatView performs its own fetches (history load, useChat's /api/chat); stub it out
// so this test stays focused on ChatPage's own activeId/event wiring.
vi.mock("@/components/chat/chat-view", () => ({
  ChatView: ({ conversationId }: { conversationId: string }) => <div>Chat view for {conversationId}</div>,
}));

function mockFetchList(list: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/conversations" && (!init || init.method === undefined)) {
      return { ok: true, json: async () => ({ conversations: list }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
}

describe("ChatPage", () => {
  it("shows the empty state before any chat is selected", async () => {
    mockFetchList([]);
    render(<ChatPage />);
    expect(await screen.findByText(/start a new chat/i)).toBeInTheDocument();
  });

  it("resets the open chat to the empty state when the workspace changes", async () => {
    mockFetchList([{ id: "c1", title: "First", createdAt: new Date(0).toISOString() }]);
    render(<ChatPage />);
    await userEvent.click(await screen.findByText("First"));
    expect(await screen.findByText("Chat view for c1")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("workspace-changed"));
    });

    await waitFor(() => {
      expect(screen.queryByText("Chat view for c1")).not.toBeInTheDocument();
    });
    expect(await screen.findByText(/start a new chat/i)).toBeInTheDocument();
  });
});
