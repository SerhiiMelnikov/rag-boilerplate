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
    // "Th" trailing so "Two." is confirmed rather than sitting at the very end
    // of arrived text (withheld while streaming; see sentences.ts).
    rerender(<Host {...base} answer="One. Two. Th" engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["One.", "Two."]);
  });

  it("does not speak an unfinished sentence until it finishes", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} answer="One. Tw" engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["One."]);
    // "One. Two." alone would leave "Two." at the very end of arrived text, which
    // is now withheld while streaming (see sentences.ts): the end of arrived text
    // is indistinguishable from a delta boundary, so growth has to confirm it —
    // hence "Th" following, rather than the stream stopping right on the period.
    rerender(<Host {...base} answer="One. Two. Th" engine={engine} />);
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

  // Regression: cancel() used to live in the effect keyed on [answer, status,
  // enabled, active], so every streamed token re-ran it while disabled — a
  // per-token browser-API call for a feature nobody enabled. It must now be its
  // own effect keyed on [enabled, active], so it fires once for the toggle
  // staying off across a whole streamed answer, not once per token.
  it("does not call cancel per streamed token while disabled", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} enabled={false} answer="One." engine={engine} />);
    engine.cancel.mockClear();
    rerender(<Host {...base} enabled={false} answer="One. Tw" engine={engine} />);
    rerender(<Host {...base} enabled={false} answer="One. Two." engine={engine} />);
    rerender(<Host {...base} enabled={false} status="ready" answer="One. Two." engine={engine} />);
    expect(engine.cancel).not.toHaveBeenCalled();
  });

  it("speaks nothing already on screen when switched on mid-answer, only what's new after", () => {
    const engine = fakeEngine();
    // "Th" trailing, not a bare "One. Two.": the toggle must land after "Two." is
    // actually confirmed (a delta arrived past its period), not while it still
    // sits at the very end of arrived text — that instant is withheld either way
    // (see sentences.ts), so landing exactly there would make this test about
    // the boundary rather than about the adopt-on-toggle behavior it names.
    const { rerender } = render(<Host {...base} enabled={false} answer="One. Two. Th" engine={engine} />);
    rerender(<Host {...base} enabled answer="One. Two. Th" engine={engine} />);
    expect(engine.speak).not.toHaveBeenCalled();
    rerender(<Host {...base} enabled answer="One. Two. Three. Four" engine={engine} />);
    expect(engine.speak.mock.calls.map((c) => c[0])).toEqual(["Three."]);
  });

  // Regression: the adopt branch must use the SAME flush flag as the speak loop.
  // Adopting with flush:false while the speak loop below uses flush:!streaming
  // (true here, since status is "ready") made the two disagree by exactly the
  // trailing fragment — the adopt branch didn't count "Hello" as spoken, so the
  // speak loop immediately spoke the whole answer that was already on screen.
  it("adopts a flushed trailing fragment too when switched on while not streaming", () => {
    const engine = fakeEngine();
    const { rerender } = render(<Host {...base} status="ready" enabled={false} answer="Hello" engine={engine} />);
    rerender(<Host {...base} status="ready" enabled answer="Hello" engine={engine} />);
    expect(engine.speak).not.toHaveBeenCalled();
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
    // "More" trailing so "Fresh." is confirmed rather than sitting at the very
    // end of arrived text (withheld while streaming; see sentences.ts).
    rerender(<Host {...base} turnKey="m2" answer="Fresh. More" engine={engine} />);
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
    // status "ready": the answer's own trailing period sits at the very end of
    // the text, which is withheld while streaming (see sentences.ts) — this test
    // is about stripping, not about streaming, so it renders a stream that has
    // already finished.
    render(<Host {...base} status="ready" answer="**Bold** and [a link](https://x.test)." engine={engine} />);
    expect(engine.speak.mock.calls[0][0]).toBe("Bold and a link.");
  });

  it("does nothing at all when there is no engine", () => {
    expect(() => render(<Host {...base} answer="One." engine={null} />)).not.toThrow();
  });

  it("reads a Cyrillic sentence with a Ukrainian voice and a Latin one with the browser's", () => {
    const engine = fakeEngine();
    // status "ready": the second sentence's trailing period sits at the very end
    // of the text, which is withheld while streaming (see sentences.ts) — this
    // test is about per-sentence language, not about streaming, so it renders a
    // stream that has already finished (same reasoning as "strips markdown
    // before speaking" above).
    render(<Host {...base} status="ready" answer="Привіт, світе. Hello there, world." engine={engine} />);
    const langs = engine.speak.mock.calls.map((c) => c[1]);
    expect(langs[0]).toBe("uk-UA");
    expect(langs[1]).toBe(navigator.language);
  });
});
