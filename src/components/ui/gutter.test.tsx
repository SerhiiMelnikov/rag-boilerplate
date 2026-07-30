// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Gutter } from "@/components/ui/gutter";

describe("Gutter", () => {
  it("is grounded and ticked once per source", () => {
    const { container } = render(<Gutter sources={2} />);
    const rule = container.firstElementChild as HTMLElement;
    expect(rule.dataset.grounded).toBe("true");
    expect(rule.querySelectorAll("[data-tick]")).toHaveLength(2);
  });

  it("caps the ticks so a 40-source answer does not draw 40 dots", () => {
    const { container } = render(<Gutter sources={40} />);
    expect(container.querySelectorAll("[data-tick]").length).toBeLessThanOrEqual(4);
  });

  it("goes dashed and tickless with no sources — the ungrounded answer", () => {
    const { container } = render(<Gutter sources={0} />);
    const rule = container.firstElementChild as HTMLElement;
    expect(rule.dataset.grounded).toBe("false");
    expect(rule.className).toContain("border-dashed");
    expect(rule.querySelectorAll("[data-tick]")).toHaveLength(0);
  });

  it("is decorative: the count must be conveyed in text next to it, never by the rule alone", () => {
    const { container } = render(<Gutter sources={2} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
