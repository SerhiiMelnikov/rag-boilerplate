// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnswerMeta, provenance } from "./answer-meta";

describe("provenance", () => {
  it("counts passages when the answer cited documents", () => {
    expect(provenance(5, 0)).toEqual({ ticks: 5, before: "Grounded in", count: 5, after: "passages" });
  });

  it("uses the singular for one passage", () => {
    expect(provenance(1, 0)).toEqual({ ticks: 1, before: "Grounded in", count: 1, after: "passage" });
  });

  it("says nothing about documents when there were none", () => {
    expect(provenance(0, 0)).toEqual({
      ticks: 0, before: "Answered without your documents", count: null, after: "",
    });
  });

  it("describes an image answer as images, never as ungrounded", () => {
    // The handler persists an image answer with sources: [], so the plain zero case
    // would tell the user their photos came from nowhere.
    expect(provenance(0, 4)).toEqual({
      ticks: 4, before: "", count: 4, after: "images from your library",
    });
    expect(provenance(0, 1).after).toBe("image from your library");
  });
});

describe("AnswerMeta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the count in the mono face and the words in prose", () => {
    const { container } = render(
      <AnswerMeta messageId="m1" sourceCount={5} imageCount={0} rating={null} />,
    );
    const count = container.querySelector(".font-mono");
    expect(count).toHaveTextContent("5");
    expect(container.textContent).toContain("Grounded in");
    expect(container.textContent).toContain("passages");
  });

  it("carries the rating controls", () => {
    render(<AnswerMeta messageId="m1" sourceCount={0} imageCount={0} rating={1} />);
    expect(screen.getByRole("button", { name: "Thumbs up" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Thumbs down" })).toHaveAttribute("aria-pressed", "false");
  });
});
