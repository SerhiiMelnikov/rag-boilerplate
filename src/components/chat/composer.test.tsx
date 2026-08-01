// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./composer";

// The shared stub in vitest.setup.ts answers every query with matches: true, which is
// the fine-pointer case. The coarse case overrides it for one test.
function stubPointer(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Composer", () => {
  it("submits on Enter where a pointer exists", async () => {
    const onSubmit = vi.fn();
    render(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} busy={false} />);
    await userEvent.type(screen.getByLabelText("Message"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    render(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} busy={false} />);
    await userEvent.type(screen.getByLabelText("Message"), "{Shift>}{Enter}{/Shift}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("leaves Enter alone on a touch keyboard", async () => {
    // Taking the return key on a phone makes the composer single-line in practice:
    // there is no Shift to hold.
    stubPointer(false);
    const onSubmit = vi.fn();
    render(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} busy={false} />);
    await userEvent.type(screen.getByLabelText("Message"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses to send whitespace", async () => {
    const onSubmit = vi.fn();
    render(<Composer value="   " onChange={() => {}} onSubmit={onSubmit} busy={false} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Message"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is disabled while a turn is in flight", () => {
    render(<Composer value="hello" onChange={() => {}} onSubmit={() => {}} busy />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("leaves Enter alone while a turn is in flight, so it still makes a newline", () => {
    // Taking the key and then declining to send is the worst of both: no message goes
    // out and no paragraph is started either.
    const onSubmit = vi.fn();
    render(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} busy />);
    // fireEvent returns false when the handler called preventDefault.
    const notPrevented = fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
    expect(notPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("collapses the grown box once the value is cleared", () => {
    // Growth is driven by the textarea's own input event; clearing the value through
    // React fires none, so after sending a multi-line message the box stayed tall and
    // empty until the next keystroke.
    const props = { onChange: () => {}, onSubmit: () => {}, busy: false };
    const { rerender } = render(<Composer {...props} value={"first line\nsecond line"} />);
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    // What autoGrow leaves behind after a few lines have been typed.
    textarea.style.height = "120px";

    rerender(<Composer {...props} value="" />);

    expect(textarea.style.height).toBe("");
  });

  describe("focus signal", () => {
    const props = { value: "", onChange: () => {}, onSubmit: () => {}, busy: false };

    it("does not steal focus on an ordinary page load", () => {
      render(<Composer {...props} />);
      expect(screen.getByLabelText("Message")).not.toHaveFocus();
    });

    it("focuses the box when the signal is raised", () => {
      const { rerender } = render(<Composer {...props} focusSignal={0} />);
      expect(screen.getByLabelText("Message")).not.toHaveFocus();
      rerender(<Composer {...props} focusSignal={1} />);
      expect(screen.getByLabelText("Message")).toHaveFocus();
    });

    it("focuses again on a second bump", () => {
      const { rerender } = render(<Composer {...props} focusSignal={1} />);
      screen.getByLabelText("Message").blur();
      rerender(<Composer {...props} focusSignal={2} />);
      expect(screen.getByLabelText("Message")).toHaveFocus();
    });

    it("focuses when it mounts under a signal that was already raised", () => {
      // "New chat" while a conversation is open clears the selection, and clearing it
      // remounts the view — so the composer taking the bump is a brand new one.
      render(<Composer {...props} focusSignal={3} />);
      expect(screen.getByLabelText("Message")).toHaveFocus();
    });
  });
});
