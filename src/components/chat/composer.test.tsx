// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
