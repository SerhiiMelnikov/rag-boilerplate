// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageTrend } from "./usage-trend";
import type { UsageTrendPoint } from "@/lib/analytics/usage";

describe("UsageTrend", () => {
  it("sizes the busiest day's bar at 100% and a half-sized day at 50%", () => {
    const points: UsageTrendPoint[] = [
      { day: "2026-07-01", promptTokens: 500, completionTokens: 500, totalTokens: 1000 },
      { day: "2026-07-02", promptTokens: 250, completionTokens: 250, totalTokens: 500 },
    ];
    const { container } = render(<UsageTrend points={points} />);
    const bars = container.querySelectorAll("li > div > div");
    expect(bars[0]).toHaveStyle({ width: "100%" });
    expect(bars[1]).toHaveStyle({ width: "50%" });
  });

  it("renders zero-width bars for an all-zero set, never NaN", () => {
    const points: UsageTrendPoint[] = [
      { day: "2026-07-01", promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      { day: "2026-07-02", promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    ];
    const { container } = render(<UsageTrend points={points} />);
    const bars = container.querySelectorAll("li > div > div");
    expect(bars[0]).toHaveStyle({ width: "0%" });
    expect(bars[1]).toHaveStyle({ width: "0%" });
    expect(container.innerHTML).not.toMatch(/NaN/);
  });

  it("renders the empty message naming the window when there are no points", () => {
    render(<UsageTrend points={[]} />);
    expect(screen.getByText(/no recorded usage in the last 30 days/i)).toBeInTheDocument();
  });
});
