// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageContent } from "./message-content";

describe("MessageContent", () => {
  it("renders markdown through the chat prose class", () => {
    const { container } = render(<MessageContent content={"# Title\n\nSome **bold** text."} />);
    expect(container.firstElementChild).toHaveClass("prose-chat");
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("bold");
  });

  it("does not force pre-wrap onto markdown blocks", () => {
    // ReactMarkdown already emits block elements. whitespace-pre-wrap on top of them
    // doubles the spacing and turns a single source newline into a visible break.
    const { container } = render(<MessageContent content={"a\nb"} />);
    expect(container.firstElementChild?.className).not.toContain("whitespace-pre-wrap");
  });

  it("renders a fenced block as pre > code", () => {
    const { container } = render(<MessageContent content={"```js\nconst a = 1;\n```"} />);
    expect(container.querySelector("pre code")).toBeTruthy();
  });
});
