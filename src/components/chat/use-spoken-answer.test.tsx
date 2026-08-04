// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useSpokenAnswer } from "./use-spoken-answer";
import type { SpeechEngine } from "./speech-engine";

function fakeEngine() {
  return { speak: vi.fn(), cancel: vi.fn() } satisfies SpeechEngine;
}

// A minimal host so the hook can be driven by re-rendering with new props.
function Host(props: Parameters<typeof useSpokenAnswer>[0]) {
  useSpokenAnswer(props);
  return null;
}

const base = { status: "streaming" as const, enabled: true, turnKey: "m1" };

describe("useSpokenAnswer", () => {
  it("speaks each finished sentence exactly once as the answer grows", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One." engine={engine} />);
    rerender(<Host {...base} answer="One. Two." engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["One.", "Two."]);
  });

  it("does not speak an unfinished sentence until it finishes", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One. Tw" engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["One."]);
    rerender(<Host {...base} answer="One. Two." engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["One.", "Two."]);
  });

  it("flushes the trailing fragment when the stream ends", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One. Two" engine={engine} />);
    rerender(<Host {...base} status="ready" answer="One. Two" engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["One.", "Two"]);
  });

  it("speaks nothing while disabled", () => {
    const engine = fakeEngine();
    render(<Host {...base} enabled={false} answer="One. Two." engine={engine} />);
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it("cancels and speaks nothing already on screen when switched on mid-answer", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} enabled={false} answer="One. Two." engine={engine} />);
    rerender(<Host {...base} enabled answer="One. Two." engine={engine} />);
    expect(engine.speak).not.toHaveBeenCalled();
    rerender(<Host {...base} enabled answer="One. Two. Three." engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["Three."]);
  });

  it("cancels the moment a new message is sent, before the next answer exists", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One." engine={engine} />);
    engine.cancel.mockClear();
    // The user message is in flight; the assistant message has not been created,
    // so turnKey has not changed yet.
    rerender(<Host {...base} status="submitted" answer="One." engine={engine} />);
    expect(engine.cancel).toHaveBeenCalled();
  });

  it("cancels when switched off", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One." engine={engine} />);
    rerender(<Host {...base} enabled={false} answer="One." engine={engine} />);
    expect(engine.cancel).toHaveBeenCalled();
  });

  it("cancels and restarts counting on a new turn", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One. Two." engine={engine} />);
    engine.speak.mockClear();
    rerender(<Host {...base} turnKey="m2" answer="Fresh." engine={engine} />);
    expect(engine.cancel).toHaveBeenCalled();
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["Fresh."]);
  });

  it("cancels on unmount", () => {
    const engine = fakeEngine();
    render(<Host {...base} answer="One." engine={engine} />);
    cleanup();
    expect(engine.cancel).toHaveBeenCalled();
  });

  it("strips markdown before speaking", () => {
    const engine = fakeEngine();
    render(<Host {...base} answer="**Bold** and [a link](https://x.test)." engine={engine} />);
    expect(engine.speak.mock.calls[0][0]).toBe("Bold and a link.");
  });

  it("does nothing at all when there is no engine", () => {
    expect(() => render(<Host {...base} answer="One." engine={null} />)).not.toThrow();
  });
});
