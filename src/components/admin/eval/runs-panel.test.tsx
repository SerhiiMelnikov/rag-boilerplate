// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunsPanel } from "./runs-panel";

const AGGREGATE = { avgRecall: 0.8, avgPrecision: 0.6, avgMrr: 0.5, avgJudgeScore: 4.2, passRate: 0.75, questionCount: 4 };

const DONE_RUN = {
  id: "r1",
  status: "done" as const,
  settingsSnapshot: {},
  aggregate: AGGREGATE,
  error: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const PENDING_RUN = {
  id: "r2",
  status: "pending" as const,
  settingsSnapshot: {},
  aggregate: null,
  error: null,
  createdAt: "2026-01-02T00:00:00Z",
};

const RESULTS = [
  {
    id: "res1",
    questionId: "q1",
    questionText: "What is the refund policy?",
    retrieved: [{ documentId: "d1", filename: "policy.pdf", score: 0.9 }],
    hit: true,
    recall: 1,
    precision: 0.5,
    mrr: 1,
    judgeScore: 4,
    judgeRationale: "Correct and grounded in the context.",
    generatedAnswer: "Refunds are available within 30 days.",
    error: null,
  },
];

// Mutable list backing GET /api/admin/evaluation/runs so a test can flip status
// between fetches (simulating the background job progressing).
function stubFetch(handler?: (url: string, init?: { method?: string }) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      if (handler) {
        const custom = handler(url, init);
        if (custom) return custom;
      }
      if (typeof url === "string" && url.startsWith("/api/admin/evaluation/runs/")) {
        return { ok: true, status: 200, json: async () => ({ run: DONE_RUN, results: RESULTS }) };
      }
      if (init?.method === "POST") {
        return { ok: true, status: 201, json: async () => ({ id: "r3", status: "pending" }) };
      }
      return { ok: true, status: 200, json: async () => ({ runs: [DONE_RUN] }) };
    }) as never,
  );
}

beforeEach(() => stubFetch());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RunsPanel", () => {
  it("renders a fetched runs list with aggregate tiles", async () => {
    render(<RunsPanel />);
    expect(await screen.findByText(/80%/)).toBeInTheDocument(); // recall
    expect(screen.getByText(/60%/)).toBeInTheDocument(); // precision
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("posts to /api/admin/evaluation/runs and reloads, showing the new pending run", async () => {
    let posted = false;
    stubFetch((url, init) => {
      if (init?.method === "POST") {
        posted = true;
        return { ok: true, status: 201, json: async () => ({ id: "r3", status: "pending" }) };
      }
      if (url === "/api/admin/evaluation/runs" && !init?.method) {
        return { ok: true, status: 200, json: async () => ({ runs: posted ? [PENDING_RUN, DONE_RUN] : [DONE_RUN] }) };
      }
      return undefined;
    });

    render(<RunsPanel />);
    await screen.findByText("done");
    fireEvent.click(screen.getByRole("button", { name: "Run evaluation" }));

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const post = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      expect(post).toBeTruthy();
      expect(post![0]).toBe("/api/admin/evaluation/runs");
    });

    expect(await screen.findByText("pending")).toBeInTheDocument();
  });

  it("selecting a run fetches its detail and renders per-question result rows", async () => {
    render(<RunsPanel />);
    await screen.findByText("done");
    fireEvent.click(screen.getByText("done").closest("button")!);

    expect(await screen.findByText("What is the refund policy?")).toBeInTheDocument();
    // Judge rationale is always visible, no disclosure click required.
    expect(screen.getByText("Correct and grounded in the context.")).toBeInTheDocument();
    // Collapsed by default: the generated answer is not shown until expanded.
    expect(screen.queryByText(/Refunds are available within 30 days/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("What is the refund policy?"));
    expect(await screen.findByText(/Refunds are available within 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/Correct and grounded in the context/)).toBeInTheDocument();
  });

  it("polls the list while a run is pending, and stops once it settles to done", async () => {
    vi.useFakeTimers();
    let phase: "pending" | "done" = "pending";
    stubFetch((url, init) => {
      if (url === "/api/admin/evaluation/runs" && !init?.method) {
        return { ok: true, status: 200, json: async () => ({ runs: [phase === "pending" ? PENDING_RUN : DONE_RUN] }) };
      }
      return undefined;
    });

    render(<RunsPanel />);
    // Flush the initial mount fetch (a microtask, unaffected by the faked clock)
    // inside act() so its resulting state update is captured correctly.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("pending")).toBeInTheDocument();

    const countGets = () =>
      (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
        (c) => c[0] === "/api/admin/evaluation/runs" && !(c[1] as { method?: string } | undefined)?.method,
      ).length;

    const initialGets = countGets();

    // First poll tick: still pending, so the interval must still be running afterwards.
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await vi.waitFor(() => expect(countGets()).toBeGreaterThan(initialGets));

    // Flip the backing data to done, then let the next poll tick pick it up.
    phase = "done";
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await vi.waitFor(() => expect(screen.getByText("done")).toBeInTheDocument());

    const settledGets = countGets();
    // Advance well past another interval: no further fetches should occur since
    // nothing is in-flight anymore (the interval must have been cleared).
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(countGets()).toBe(settledGets);
  });
});
