// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAdminSettings } from "./use-admin-settings";

const LOADED = { chatProvider: "google", chatModel: "gemini", temperature: 0.2 };

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => impl(url, init)) as unknown as typeof fetch;
}

beforeEach(() => {
  mockFetch(() => ({ ok: true, json: async () => LOADED }));
});

describe("useAdminSettings", () => {
  it("loads the settings on mount", async () => {
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.settings).toEqual(LOADED));
    expect(result.current.loadError).toBeNull();
  });

  it("reports a failed load instead of staying blank forever", async () => {
    mockFetch(() => ({ ok: false, json: async () => ({}) }));
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.loadError).toBeTruthy());
    expect(result.current.settings).toBeNull();
  });

  it("merges a patch into the loaded settings", async () => {
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.settings).toBeTruthy());
    act(() => result.current.patch({ temperature: 0.9 }));
    expect(result.current.settings).toEqual({ ...LOADED, temperature: 0.9 });
  });

  it("sends exactly the body it is given, and adopts the response", async () => {
    const SAVED = { ...LOADED, temperature: 0.9 };
    mockFetch((_url, init) => (init?.method === "PUT"
      ? { ok: true, json: async () => SAVED }
      : { ok: true, json: async () => LOADED }));
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.settings).toBeTruthy());

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.save({ temperature: 0.9 }); });

    expect(ok).toBe(true);
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
    expect(JSON.parse((put![1] as { body: string }).body)).toEqual({ temperature: 0.9 });
    expect(result.current.settings).toEqual(SAVED);
    expect(result.current.saved).toBe(true);
  });

  // The old forms had `if (res.ok)` with no else: a rejected save was silent.
  it("reports a rejected save and returns false", async () => {
    mockFetch((_url, init) => (init?.method === "PUT"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => LOADED }));
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.settings).toBeTruthy());

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.save({ temperature: 0.9 }); });

    expect(ok).toBe(false);
    expect(result.current.saveError).toBeTruthy();
    expect(result.current.saved).toBe(false);
  });

  it("clears the saved flag as soon as the admin edits again", async () => {
    mockFetch((_url, init) => (init?.method === "PUT"
      ? { ok: true, json: async () => LOADED }
      : { ok: true, json: async () => LOADED }));
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.settings).toBeTruthy());
    await act(async () => { await result.current.save({ temperature: 0.9 }); });
    expect(result.current.saved).toBe(true);
    act(() => result.current.patch({ temperature: 0.4 }));
    expect(result.current.saved).toBe(false);
  });

  // Not the same path as `{ ok: false }`: a network failure, an aborted request or
  // a body that is not JSON all reject rather than resolving, and the `catch` that
  // handles them is otherwise untested — it could be deleted and every other test
  // here would still pass.
  it("reports a load that throws, not just one that returns !ok", async () => {
    global.fetch = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.loadError).toBeTruthy());
    expect(result.current.settings).toBeNull();
  });

  it("reports a save that throws, returns false, and does not leave saving stuck", async () => {
    mockFetch((_url, init) => {
      if (init?.method === "PUT") throw new Error("network down");
      return { ok: true, json: async () => LOADED };
    });
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.settings).toBeTruthy());

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.save({ temperature: 0.9 }); });

    expect(ok).toBe(false);
    expect(result.current.saveError).toBeTruthy();
    // The `finally` is what guarantees this. Without it the page's Save button
    // stays disabled forever and only a reload recovers.
    expect(result.current.saving).toBe(false);
  });
});
