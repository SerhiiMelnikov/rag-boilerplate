// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { useTranscribeAvailable } from "./use-transcribe-available";

function Host({ onValue }: { onValue: (v: boolean) => void }) {
  onValue(useTranscribeAvailable());
  return null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function lastValue(fetchImpl: typeof fetch): Promise<boolean> {
  vi.stubGlobal("fetch", fetchImpl);
  let value = false;
  render(<Host onValue={(v) => { value = v; }} />);
  await waitFor(() => expect(value).toBe(true)).catch(() => {});
  return value;
}

describe("useTranscribeAvailable", () => {
  it("is true when the probe says available", async () => {
    expect(await lastValue((async () => Response.json({ available: true })) as typeof fetch)).toBe(true);
  });

  it("is false when the probe says unavailable", async () => {
    expect(await lastValue((async () => Response.json({ available: false })) as typeof fetch)).toBe(false);
  });

  it("is false when the probe fails", async () => {
    expect(await lastValue((async () => { throw new Error("offline"); }) as typeof fetch)).toBe(false);
  });

  it("is false when the probe 401s", async () => {
    // The body says available: true — if the !res.ok guard were ever deleted,
    // data.available === true would make this pass for the wrong reason. The
    // status alone must be what turns this false.
    expect(await lastValue((async () => Response.json({ available: true }, { status: 401 })) as typeof fetch)).toBe(false);
  });
});
