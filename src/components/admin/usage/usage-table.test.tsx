// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageTable } from "./usage-table";
import type { UsageRow } from "@/lib/analytics/usage";

describe("UsageTable", () => {
  it("renders a row's label and locale-formatted numbers", () => {
    const rows: UsageRow[] = [
      { id: "u1", label: "alice@example.com", promptTokens: 1000000, completionTokens: 234567, totalTokens: 1234567, answers: 42 },
    ];
    render(<UsageTable rows={rows} emptyMessage="No recorded usage in this period." />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
    expect(screen.getByText("1,000,000")).toBeInTheDocument();
    expect(screen.getByText("234,567")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders the empty message when there are no rows", () => {
    render(<UsageTable rows={[]} emptyMessage="No recorded usage in this period." />);
    expect(screen.getByText("No recorded usage in this period.")).toBeInTheDocument();
  });

  it("preserves the given row order rather than sorting", () => {
    // Deliberately NOT in descending total-token order, proving the component
    // trusts the SQL's ordering instead of re-sorting.
    const rows: UsageRow[] = [
      { id: "light", label: "light-user", promptTokens: 10, completionTokens: 10, totalTokens: 20, answers: 1 },
      { id: "heavy", label: "heavy-user", promptTokens: 1000, completionTokens: 1000, totalTokens: 2000, answers: 5 },
      { id: "mid", label: "mid-user", promptTokens: 100, completionTokens: 100, totalTokens: 200, answers: 2 },
    ];
    render(<UsageTable rows={rows} emptyMessage="empty" />);
    const cells = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(cells[0]).toContain("light-user");
    expect(cells[1]).toContain("heavy-user");
    expect(cells[2]).toContain("mid-user");
  });
});
