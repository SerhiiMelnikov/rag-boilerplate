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

  it("grows to fit its content when autoGrow is set", async () => {
    render(<Textarea aria-label="Message" autoGrow />);
    const area = screen.getByLabelText("Message") as HTMLTextAreaElement;
    // jsdom reports scrollHeight 0, so assert the mechanism, not the pixels: the
    // component must clear the inline height before measuring, or it can only ever
    // grow and never shrink.
    Object.defineProperty(area, "scrollHeight", { configurable: true, value: 120 });
    await userEvent.type(area, "a long message");
    expect(area.style.height).toBe("120px");
  });

  it("leaves height alone without autoGrow", async () => {
    render(<Textarea aria-label="Message" />);
    const area = screen.getByLabelText("Message") as HTMLTextAreaElement;
    Object.defineProperty(area, "scrollHeight", { configurable: true, value: 120 });
    await userEvent.type(area, "x");
    expect(area.style.height).toBe("");
  });
});
