// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationList } from "./conversation-list";

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

function rows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    title: `Conversation ${i}`,
    createdAt: iso(0),
  }));
}

function stubFetch(conversations: Array<{ id: string; title: string; createdAt: string }>) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH" || init?.method === "DELETE") {
      return new Response(null, { status: init.method === "PATCH" ? 200 : 204 });
    }
    return new Response(JSON.stringify({ conversations }), { status: 200 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

const noop = () => {};

describe("ConversationList", () => {
  it("lists conversations under a date heading", async () => {
    stubFetch([{ id: "c1", title: "Refund policy", createdAt: iso(0) }]);
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={noop} />);
    expect(await screen.findByText("Refund policy")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("hides the search box until the list is worth searching", async () => {
    stubFetch(rows(3));
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={noop} />);
    await screen.findByText("Conversation 0");
    expect(screen.queryByLabelText("Search conversations")).toBeNull();
  });

  it("filters by title once the list is long", async () => {
    stubFetch([...rows(8), { id: "x", title: "Refund policy", createdAt: iso(0) }]);
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={noop} />);
    await screen.findByText("Refund policy");
    await userEvent.type(screen.getByLabelText("Search conversations"), "refund");
    expect(screen.getByText("Refund policy")).toBeInTheDocument();
    expect(screen.queryByText("Conversation 0")).toBeNull();
  });

  it("PATCHes a renamed conversation", async () => {
    const spy = stubFetch([{ id: "c1", title: "Refund policy", createdAt: iso(0) }]);
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={noop} />);
    await screen.findByText("Refund policy");
    await userEvent.click(screen.getByRole("button", { name: /^Rename Refund policy/ }));
    const field = screen.getByLabelText("Conversation title");
    await userEvent.clear(field);
    await userEvent.type(field, "Returns{Enter}");

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("/api/conversations/c1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Returns" }),
      }),
    );
  });

  it("confirms before deleting", async () => {
    const spy = stubFetch([{ id: "c1", title: "Refund policy", createdAt: iso(0) }]);
    const onDeleted = vi.fn();
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={onDeleted} />);
    await screen.findByText("Refund policy");
    await userEvent.click(screen.getByRole("button", { name: /^Delete Refund policy/ }));
    // The trash icon alone must not fire the request; only the dialog's own
    // confirm button may. A regression that wires delete straight to the row
    // icon would still leave onDeleted uncalled here, but this catches it too.
    expect(spy).not.toHaveBeenCalledWith("/api/conversations/c1", { method: "DELETE" });
    // Headless UI marks everything outside an open dialog aria-hidden, so the
    // confirm button is only findable with { hidden: true }.
    await userEvent.click(await screen.findByRole("button", { name: "Delete", hidden: true }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("c1"));
    expect(spy).toHaveBeenCalledWith("/api/conversations/c1", { method: "DELETE" });
  });

  it("does not report a delete as done when the server rejects it", async () => {
    // A failed delete must not tell the parent the conversation is gone: it is
    // still on the server, and the row must stay on screen.
    const spy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 500 });
      return new Response(
        JSON.stringify({ conversations: [{ id: "c1", title: "Refund policy", createdAt: iso(0) }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", spy);
    const onDeleted = vi.fn();
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={onDeleted} />);
    await screen.findByText("Refund policy");
    await userEvent.click(screen.getByRole("button", { name: /^Delete Refund policy/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete", hidden: true }));

    expect(await screen.findByText("Could not delete that conversation.")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText("Refund policy")).toBeInTheDocument();
  });

  it("surfaces a failed rename instead of swallowing it", async () => {
    // A rename the server rejects must not look like it took: an error appears
    // and the row is reloaded from the server rather than trusting the draft.
    const spy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(null, { status: 400 });
      return new Response(
        JSON.stringify({ conversations: [{ id: "c1", title: "Refund policy", createdAt: iso(0) }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", spy);
    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={noop} />);
    await screen.findByText("Refund policy");
    await userEvent.click(screen.getByRole("button", { name: /^Rename Refund policy/ }));
    const field = screen.getByLabelText("Conversation title");
    await userEvent.clear(field);
    await userEvent.type(field, "Returns{Enter}");

    expect(await screen.findByText("Could not rename that conversation.")).toBeInTheDocument();
  });

  it("clears a stale query once a delete drops the list out of range for search", async () => {
    // Eight items is exactly at SEARCH_THRESHOLD, so the box is up; deleting the
    // one item matching the active query drops the total to seven, taking the
    // box down too. The other seven must not stay hidden behind "Refund".
    const initial = [...rows(7), { id: "refund", title: "Refund policy", createdAt: iso(0) }];
    const remaining = rows(7);
    let deleted = false;
    const spy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      const conversations = deleted ? remaining : initial;
      return new Response(JSON.stringify({ conversations }), { status: 200 });
    });
    vi.stubGlobal("fetch", spy);

    render(<ConversationList activeId={null} onSelect={noop} onNew={noop} onDeleted={noop} />);
    await screen.findByText("Refund policy");
    await userEvent.type(screen.getByLabelText("Search conversations"), "Refund");
    expect(screen.queryByText("Conversation 0")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Delete Refund policy/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete", hidden: true }));

    // The list is now below the search threshold and the box is gone; the
    // remaining conversations must not stay hidden behind the query that used
    // to filter them.
    await waitFor(() => expect(screen.queryByLabelText("Search conversations")).toBeNull());
    for (let i = 0; i < 7; i++) {
      expect(screen.getByText(`Conversation ${i}`)).toBeInTheDocument();
    }
  });

  it("asks the parent for a blank slate rather than creating a row", async () => {
    // The conversation is born from the first message now; a New chat that POSTs
    // would leave an empty row behind for anyone who changed their mind.
    const spy = stubFetch([]);
    const onNew = vi.fn();
    render(<ConversationList activeId={null} onSelect={noop} onNew={onNew} onDeleted={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNew).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalledWith("/api/conversations", { method: "POST" });
  });
});
