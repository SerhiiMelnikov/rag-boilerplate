// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatTiles } from "./stat-tiles";
import { NegativeList } from "./negative-list";
import { DocumentQualityTable } from "./document-quality-table";
import { TrendBars } from "./trend-bars";

describe("StatTiles", () => {
  it("renders counts and satisfaction percentage", () => {
    render(<StatTiles summary={{ total: 10, rated: 4, up: 3, down: 1, unrated: 6, satisfaction: 0.75 }} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
  it("shows a dash for satisfaction when there are no ratings", () => {
    render(<StatTiles summary={{ total: 0, rated: 0, up: 0, down: 0, unrated: 0, satisfaction: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("NegativeList", () => {
  it("shows an empty state when there are no items", () => {
    render(<NegativeList items={[]} />);
    expect(screen.getByText(/no negative feedback yet/i)).toBeInTheDocument();
  });
  it("expands a row to reveal the full answer and sources", () => {
    render(
      <NegativeList
        items={[{ id: "m1", question: "why?", answer: "the full answer", filenames: ["a.md"], createdAt: new Date(0) }]}
      />,
    );
    fireEvent.click(screen.getByText("why?"));
    expect(screen.getByText(/the full answer/)).toBeInTheDocument();
    expect(screen.getByText(/a\.md/)).toBeInTheDocument();
  });
});

describe("DocumentQualityTable", () => {
  it("shows an empty state with no rows", () => {
    render(<DocumentQualityTable rows={[]} />);
    expect(screen.getByText(/no document feedback yet/i)).toBeInTheDocument();
  });
  it("renders a document row", () => {
    render(<DocumentQualityTable rows={[{ documentId: "d1", filename: "a.md", appearances: 4, up: 1, down: 3, satisfaction: 0.25 }]} />);
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });
});

describe("TrendBars", () => {
  it("shows an empty state with no points", () => {
    render(<TrendBars points={[]} />);
    expect(screen.getByText(/no rated answers in the last 30 days/i)).toBeInTheDocument();
  });
  it("renders a day bucket", () => {
    render(<TrendBars points={[{ day: "2026-07-01", up: 2, down: 2, satisfaction: 0.5 }]} />);
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
  });
});
