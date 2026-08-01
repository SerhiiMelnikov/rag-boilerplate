// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "./chat-message";
import type { PersistedMessage } from "./types";

const saved = (over: Partial<PersistedMessage> = {}): PersistedMessage => ({
  id: "m1", role: "assistant", content: "answer", images: [], rating: null, sourceCount: 2, ...over,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatMessage", () => {
  it("renders a question as a heading, not as markdown", () => {
    render(<ChatMessage role="user" content="# not a heading" isFirst />);
    // The '#' is part of the question the user typed, so it survives verbatim.
    expect(screen.getByRole("heading", { name: "# not a heading" })).toBeInTheDocument();
  });

  it("separates a later question with a rule, but not the first", () => {
    const { container: first } = render(<ChatMessage role="user" content="q" isFirst />);
    expect(first.firstElementChild?.className).not.toContain("border-t");
    const { container: later } = render(<ChatMessage role="user" content="q" isFirst={false} />);
    expect(later.firstElementChild?.className).toContain("border-t");
  });

  it("gives a persisted answer a gutter and a provenance line", () => {
    const { container } = render(
      <ChatMessage role="assistant" content="answer" saved={saved({ sourceCount: 3 })} isFirst={false} />,
    );
    expect(container.querySelector("[data-grounded='true']")).toBeTruthy();
    expect(container.textContent).toContain("Grounded in");
  });

  it("marks an answer with no sources as ungrounded", () => {
    const { container } = render(
      <ChatMessage role="assistant" content="answer" saved={saved({ sourceCount: 0 })} isFirst={false} />,
    );
    expect(container.querySelector("[data-grounded='false']")).toBeTruthy();
  });

  it("claims nothing while the answer is still streaming", () => {
    // No persisted row yet, so no count exists. A dashed gutter here would assert
    // 'ungrounded' about an answer that has not finished arriving.
    const { container } = render(<ChatMessage role="assistant" content="partial" isFirst={false} />);
    expect(container.querySelector("[data-grounded]")).toBeNull();
    expect(container.textContent).not.toContain("Answered without");
  });
});
