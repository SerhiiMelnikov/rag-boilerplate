// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPage } from "./chat-page";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";

// ChatView is exercised by its own suite; here it is a probe that reports the id it
// was mounted with, so the page's session logic is what is under test.
vi.mock("./chat-view", () => ({
  ChatView: ({ initialConversationId }: { initialConversationId: string | null }) => (
    <div data-testid="chat-view">{initialConversationId ?? "none"}</div>
  ),
}));

vi.mock("@/components/shell/panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
}));
vi.mock("@/components/shell/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/shell/panel-context", () => ({ usePanel: () => ({ setOpen: () => {} }) }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ conversations: [{ id: "c1", title: "Refund policy", createdAt: new Date().toISOString() }] }),
        { status: 200 },
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatPage", () => {
  it("starts with a blank composer, not a conversation", async () => {
    render(<ChatPage />);
    expect(await screen.findByTestId("chat-view")).toHaveTextContent("none");
  });

  it("mounts the selected conversation", async () => {
    render(<ChatPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));
  });

  it("ejects to a blank slate when the workspace changes", async () => {
    // A conversation belongs to exactly one workspace, so keeping it open across a
    // switch would show a chat that is no longer in the visible list.
    render(<ChatPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));
    window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("none"));
  });
});
