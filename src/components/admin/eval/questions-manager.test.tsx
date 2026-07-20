// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuestionsManager } from "./questions-manager";

const QUESTIONS = [
  { id: "q1", question: "What is the refund policy?", expectedDocumentIds: ["d1"], referenceAnswer: null, createdAt: "2026-01-01T00:00:00Z" },
];

// The picker must be sourced from the same files list FileWorkspacesModal/FilesManager
// use (GET /api/admin/files), filtered down to documents — images are not eligible.
const FILES = [
  { id: "d1", kind: "document", filename: "policy.pdf", ext: "pdf", status: "ready", caption: null, createdAt: "2026-01-01T00:00:00Z", workspaces: [] },
  { id: "i1", kind: "image", filename: "logo.png", ext: "png", status: "ready", caption: null, createdAt: "2026-01-01T00:00:00Z", workspaces: [] },
];

function stubFetch(handler?: (url: string, init?: { method?: string; body?: string }) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (handler) {
        const custom = handler(url, init);
        if (custom) return custom;
      }
      if (typeof url === "string" && url.startsWith("/api/admin/files")) {
        return { ok: true, status: 200, json: async () => ({ files: FILES }) };
      }
      if (init?.method === "POST" || init?.method === "PATCH") {
        return { ok: true, status: 201, json: async () => ({ id: "q2" }) };
      }
      return { ok: true, status: 200, json: async () => ({ questions: QUESTIONS }) };
    }) as never,
  );
}

beforeEach(() => stubFetch());
afterEach(() => vi.unstubAllGlobals());

describe("QuestionsManager", () => {
  it("lists fetched questions with their expected document filenames", async () => {
    render(<QuestionsManager />);
    expect(await screen.findByText("What is the refund policy?")).toBeInTheDocument();
    expect(await screen.findByText("policy.pdf")).toBeInTheDocument();
  });

  it("only offers documents (not images) in the expected-documents picker", async () => {
    render(<QuestionsManager />);
    await screen.findByText("What is the refund policy?");
    fireEvent.click(screen.getByLabelText("Expected documents"));
    expect(await screen.findByRole("option", { name: "policy.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "logo.png" })).not.toBeInTheDocument();
  });

  it("posts a new question with the form fields and reloads the list", async () => {
    render(<QuestionsManager />);
    await screen.findByText("What is the refund policy?");

    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "What is the SLA?" } });
    fireEvent.click(screen.getByLabelText("Expected documents"));
    fireEvent.click(await screen.findByRole("option", { name: "policy.pdf" }));
    fireEvent.change(screen.getByLabelText("Reference answer"), { target: { value: "  " } });
    // Query with { hidden: true }: Headless UI's Listbox panel never completes its
    // leave transition in jsdom, so it keeps the rest of the page aria-hidden after
    // an option is picked (see the identical note in workspaces-manager.test.tsx).
    fireEvent.click(screen.getByRole("button", { name: "Add question", hidden: true }));

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const post = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
      expect(post).toBeTruthy();
      expect(post![0]).toBe("/api/admin/evaluation/questions");
      // A blank reference answer is omitted rather than sent as whitespace.
      expect(JSON.parse((post![1] as { body: string }).body)).toEqual({
        question: "What is the SLA?",
        expectedDocumentIds: ["d1"],
      });
    });

    // Reload after the mutation re-fetches the questions list.
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const gets = calls.filter((c) => c[0] === "/api/admin/evaluation/questions" && !(c[1] as { method?: string } | undefined)?.method);
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("edits an existing question via PATCH, prefilling the form", async () => {
    render(<QuestionsManager />);
    await screen.findByText("What is the refund policy?");
    fireEvent.click(screen.getByLabelText("Edit What is the refund policy?"));

    const textarea = screen.getByLabelText("Question") as HTMLTextAreaElement;
    expect(textarea.value).toBe("What is the refund policy?");
    fireEvent.change(textarea, { target: { value: "What is the refund policy, updated?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const patch = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch![0]).toBe("/api/admin/evaluation/questions/q1");
      expect(JSON.parse((patch![1] as { body: string }).body)).toEqual({
        question: "What is the refund policy, updated?",
        expectedDocumentIds: ["d1"],
      });
    });
  });

  it("deletes a question and removes it from the list", async () => {
    let deleted = false;
    stubFetch((url, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (url === "/api/admin/evaluation/questions" && !init?.method) {
        return { ok: true, status: 200, json: async () => ({ questions: deleted ? [] : QUESTIONS }) };
      }
      return undefined;
    });

    render(<QuestionsManager />);
    await screen.findByText("What is the refund policy?");
    fireEvent.click(screen.getByLabelText("Delete What is the refund policy?"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const del = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "DELETE");
      expect(del![0]).toBe("/api/admin/evaluation/questions/q1");
    });
    await waitFor(() => expect(screen.queryByText("What is the refund policy?")).not.toBeInTheDocument());
  });
});
