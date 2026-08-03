// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

// QuestionsManager and RunsPanel prove their own chrome-less rendering (and do
// their own fetching) in their component tests; stubbed here so this test is
// only about the page frame around them.
vi.mock("@/components/admin/eval/questions-manager", () => ({
  QuestionsManager: () => <div data-testid="questions-manager-stub" />,
}));
vi.mock("@/components/admin/eval/runs-panel", () => ({
  RunsPanel: () => <div data-testid="runs-panel-stub" />,
}));

import EvaluationPage from "./page";

describe("EvaluationPage", () => {
  // Both panels render no header of their own (see their component tests), so
  // nothing else on this route proves a heading exists at all.
  it("renders the page header above both panels", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin" } } as never);

    render(await EvaluationPage());

    expect(screen.getByRole("heading", { level: 1, name: "Evaluation" })).toBeInTheDocument();
    expect(screen.getByText("Golden questions and the runs scored against them.")).toBeInTheDocument();
    expect(screen.getByTestId("questions-manager-stub")).toBeInTheDocument();
    expect(screen.getByTestId("runs-panel-stub")).toBeInTheDocument();
  });
});
