// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useSpeechAvailable } from "./use-speech-available";

function Host() {
  return <span data-testid="v">{String(useSpeechAvailable())}</span>;
}
const shown = () => screen.getByTestId("v").textContent;

afterEach(() => vi.unstubAllGlobals());

describe("useSpeechAvailable", () => {
  it("is false when the browser has no speech synthesis", () => {
    render(<Host />); // jsdom provides none
    expect(shown()).toBe("false");
  });

  it("is true when voices are already present", () => {
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => [{ name: "Alex" }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<Host />);
    expect(shown()).toBe("true");
  });

  // The common Chrome case: the first getVoices() is empty and the list arrives later.
  it("becomes true when voices arrive on voiceschanged", () => {
    let fire: (() => void) | undefined;
    let voices: unknown[] = [];
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => voices,
      addEventListener: (_: string, cb: () => void) => {
        fire = cb;
      },
      removeEventListener: vi.fn(),
    });
    render(<Host />);
    expect(shown()).toBe("false");
    act(() => {
      voices = [{ name: "Alex" }];
      fire?.();
    });
    expect(shown()).toBe("true");
  });

  // Firefox under Linux with no speech-dispatcher: the API exists, the list never fills.
  it("stays false when the API exists but no voice ever arrives", () => {
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<Host />);
    expect(shown()).toBe("false");
  });
});
