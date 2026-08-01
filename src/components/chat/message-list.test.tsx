// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./message-list";
import type { PersistedMessage } from "./types";

const scrollSpy = vi.fn();

beforeEach(() => {
  // jsdom implements no scrollIntoView; the component calls it to follow a new turn.
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

const persisted = (over: Partial<PersistedMessage> = {}): PersistedMessage => ({
  id: "m2", role: "assistant", content: "answer", images: [], rating: null, sourceCount: 1, ...over,
});

describe("MessageList", () => {
  it("renders questions and answers in order", () => {
    render(
      <MessageList
        messages={[
          { id: "m1", role: "user", content: "why?" },
          { id: "m2", role: "assistant", content: "because" },
        ]}
        persistedById={new Map([["m2", persisted()]])}
        pending={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "why?" })).toBeInTheDocument();
    expect(screen.getByText("because")).toBeInTheDocument();
  });

  it("replaces an empty assistant message with the pending block", () => {
    // useChat creates the assistant message before the first token arrives. Rendering
    // it would show an empty answer with a gutter beside it.
    render(
      <MessageList
        messages={[
          { id: "m1", role: "user", content: "why?" },
          { id: "m2", role: "assistant", content: "" },
        ]}
        persistedById={new Map()}
        pending={false}
      />,
    );
    expect(screen.getByRole("status", { name: "Thinking" })).toBeInTheDocument();
  });

  it("shows the pending block before the assistant message exists", () => {
    render(
      <MessageList
        messages={[{ id: "m1", role: "user", content: "why?" }]}
        persistedById={new Map()}
        pending
      />,
    );
    expect(screen.getByRole("status", { name: "Thinking" })).toBeInTheDocument();
  });

  it("renders an error where the answer would have been", () => {
    render(
      <MessageList messages={[]} persistedById={new Map()} pending={false} error="Rate limited" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Rate limited");
  });

  it("follows a new turn but not a streamed token", () => {
    const props = { persistedById: new Map(), pending: false };
    const { rerender } = render(
      <MessageList {...props} messages={[{ id: "m1", role: "user" as const, content: "why?" }]} />,
    );
    const afterMount = scrollSpy.mock.calls.length;

    // Same message, more content: someone reading back must not be yanked to the end.
    rerender(
      <MessageList {...props} messages={[{ id: "m1", role: "user" as const, content: "why? really" }]} />,
    );
    expect(scrollSpy.mock.calls.length).toBe(afterMount);

    // A new message: follow it.
    rerender(
      <MessageList
        {...props}
        messages={[
          { id: "m1", role: "user" as const, content: "why? really" },
          { id: "m2", role: "assistant" as const, content: "because" },
        ]}
      />,
    );
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(afterMount);
  });
});
