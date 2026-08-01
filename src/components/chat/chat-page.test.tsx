// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPage } from "./chat-page";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";

// Bindings the mock factories below need are created through vi.hoisted so they are
// safe to reference from a vi.mock() factory, which is itself hoisted above this
// file's other top-level declarations.
const { getMountCount, resetMountCount, bumpMountCount, setPanelOpenMock } = vi.hoisted(() => {
  let count = 0;
  return {
    getMountCount: () => count,
    resetMountCount: () => {
      count = 0;
    },
    bumpMountCount: () => {
      count += 1;
    },
    setPanelOpenMock: vi.fn(),
  };
});

// ChatView is exercised by its own suite; here it is a probe that reports the id it
// was mounted with, so the page's session logic is what is under test. It also
// reports how many times it has been *mounted* (not merely re-rendered), via an
// effect with an empty dependency array — a prop update alone cannot increment it,
// only a remount (a fresh `key`) can. That distinction is the whole point of
// ChatPage's session/activeId split, and a mock that only echoed props back could
// not tell a remount from a rerender.
vi.mock("./chat-view", () => ({
  ChatView: ({
    initialConversationId,
    focusSignal,
  }: {
    initialConversationId: string | null;
    focusSignal?: number;
  }) => {
    const [count, setCount] = React.useState(() => getMountCount());
    React.useEffect(() => {
      bumpMountCount();
      setCount(getMountCount());
    }, []);
    return (
      <div data-testid="chat-view">
        <span data-testid="mount-count">{count}</span>
        <span data-testid="focus-signal">{focusSignal ?? "none"}</span>
        {initialConversationId ?? "none"}
      </div>
    );
  },
}));

vi.mock("@/components/shell/panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
}));
vi.mock("@/components/shell/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/shell/panel-context", () => ({ usePanel: () => ({ setOpen: setPanelOpenMock }) }));

beforeEach(() => {
  resetMountCount();
  setPanelOpenMock.mockClear();
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
    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
    });
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("none"));
  });

  it("does not remount ChatView when the already-active row is re-selected", async () => {
    // Re-clicking the highlighted row is a plausible way to dismiss the mobile
    // drawer while a message is streaming into that same conversation. Remounting
    // here would discard it — the exact harm the session/activeId split exists to
    // prevent.
    render(<ChatPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));
    const mountCountBefore = screen.getByTestId("mount-count").textContent;

    await userEvent.click(screen.getByRole("button", { name: "Refund policy" }));

    expect(screen.getByTestId("mount-count").textContent).toBe(mountCountBefore);
    expect(setPanelOpenMock).toHaveBeenLastCalledWith(false);
  });

  it("asks the composer for focus when New chat is pressed with nothing selected", async () => {
    // The whole point of the finding: with nothing selected, open(null) hits its
    // id === activeId early return, so without a signal of its own the button does
    // literally nothing.
    render(<ChatPage />);
    await screen.findByTestId("chat-view");
    const mountCountBefore = screen.getByTestId("mount-count").textContent;

    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));

    await waitFor(() => expect(screen.getByTestId("focus-signal")).toHaveTextContent("1"));
    // Nothing remounted: a remount here would discard a draft already typed.
    expect(screen.getByTestId("mount-count").textContent).toBe(mountCountBefore);
  });

  it("carries the focus signal across the remount that clearing a conversation causes", async () => {
    render(<ChatPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));

    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));

    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("none"));
    expect(Number(screen.getByTestId("focus-signal").textContent)).toBeGreaterThan(0);
  });

  it("leaves the composer alone when a conversation is opened", async () => {
    // Focusing a textarea opens the keyboard on a phone; picking a conversation out
    // of the drawer must not do that, not even after an earlier New chat.
    render(<ChatPage />);
    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));
    await waitFor(() => expect(screen.getByTestId("focus-signal")).toHaveTextContent("1"));

    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));

    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));
    expect(screen.getByTestId("focus-signal")).toHaveTextContent("0");
  });

  it("ejects to a blank slate when the active conversation is deleted", async () => {
    render(<ChatPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));

    await userEvent.click(await screen.findByRole("button", { name: /^Delete Refund policy/ }));
    // Headless UI marks everything outside an open dialog aria-hidden, so the
    // confirm button is only findable with { hidden: true }.
    await userEvent.click(await screen.findByRole("button", { name: "Delete", hidden: true }));

    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("none"));
  });

  it("leaves the mounted conversation untouched when a different one is deleted", async () => {
    const conversations = [
      { id: "c1", title: "Refund policy", createdAt: new Date().toISOString() },
      { id: "c2", title: "Shipping times", createdAt: new Date().toISOString() },
    ];
    const spy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ conversations }), { status: 200 });
    });
    vi.stubGlobal("fetch", spy);

    render(<ChatPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Refund policy" }));
    await waitFor(() => expect(screen.getByTestId("chat-view")).toHaveTextContent("c1"));
    const mountCountBefore = screen.getByTestId("mount-count").textContent;

    await userEvent.click(await screen.findByRole("button", { name: /^Delete Shipping times/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete", hidden: true }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("/api/conversations/c2", { method: "DELETE" }));
    expect(screen.getByTestId("chat-view")).toHaveTextContent("c1");
    expect(screen.getByTestId("mount-count").textContent).toBe(mountCountBefore);
  });
});
