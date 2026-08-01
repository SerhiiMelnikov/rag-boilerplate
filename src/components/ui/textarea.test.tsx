// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("accepts typing", async () => {
    render(<Textarea aria-label="Message" />);
    await userEvent.type(screen.getByLabelText("Message"), "hello");
    expect(screen.getByLabelText("Message")).toHaveValue("hello");
  });

  it("shrinks as well as grows, which is what clearing the height before measuring buys", async () => {
    render(<Textarea aria-label="Message" autoGrow />);
    const area = screen.getByLabelText("Message") as HTMLTextAreaElement;

    // Model what a browser actually does: scrollHeight never reports less than the
    // element's own inline height. A static stub would pass over an implementation
    // that measures without resetting first — which is the one bug this test exists
    // to catch, since that implementation can only ever grow.
    let contentHeight = 120;
    Object.defineProperty(area, "scrollHeight", {
      configurable: true,
      get: () => {
        const inline = Number.parseInt(area.style.height, 10);
        return Number.isNaN(inline) ? contentHeight : Math.max(contentHeight, inline);
      },
    });

    await userEvent.type(area, "a long message");
    expect(area.style.height).toBe("120px");

    contentHeight = 40; // the user deleted most of the text
    await userEvent.type(area, "x");
    expect(area.style.height).toBe("40px");
  });

  it("leaves height alone without autoGrow", async () => {
    render(<Textarea aria-label="Message" />);
    const area = screen.getByLabelText("Message") as HTMLTextAreaElement;
    Object.defineProperty(area, "scrollHeight", { configurable: true, value: 120 });
    await userEvent.type(area, "x");
    expect(area.style.height).toBe("");
  });
});
