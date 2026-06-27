// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Sources } from "@/components/chat/sources";

describe("Sources", () => {
  it("renders unique filenames", () => {
    render(<Sources sources={[
      { documentId: "d", filename: "a.md", chunkId: "1", score: 0.9 },
      { documentId: "d", filename: "a.md", chunkId: "2", score: 0.8 },
      { documentId: "e", filename: "b.md", chunkId: "3", score: 0.7 },
    ]} />);
    expect(screen.getByText(/a\.md/)).toBeInTheDocument();
    expect(screen.getByText(/b\.md/)).toBeInTheDocument();
    expect(screen.getAllByText(/\.md/)).toHaveLength(2);
  });
  it("renders nothing when empty", () => {
    const { container } = render(<Sources sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
