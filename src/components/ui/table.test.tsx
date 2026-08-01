// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

describe("Table", () => {
  it("wraps itself in a horizontal scroll container so the page never scrolls sideways", () => {
    render(
      <Table>
        <TBody>
          <TR>
            <TD>annual-report-2025.pdf</TD>
          </TR>
        </TBody>
      </Table>,
    );
    const wrapper = screen.getByRole("table").parentElement;
    expect(wrapper?.className).toContain("overflow-x-auto");
  });

  it("renders numeric cells in the mono face with tabular figures, right-aligned", () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH numeric>Chunks</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD numeric>128</TD>
          </TR>
        </TBody>
      </Table>,
    );
    const cell = screen.getByRole("cell", { name: "128" });
    expect(cell.className).toContain("font-mono");
    expect(cell.className).toContain("tabular-nums");
    expect(cell.className).toContain("text-right");
    expect(screen.getByRole("columnheader", { name: "Chunks" }).className).toContain("text-right");
  });

  it("leaves prose cells in the sans face", () => {
    render(
      <Table>
        <TBody>
          <TR>
            <TD>annual-report-2025.pdf</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("cell", { name: "annual-report-2025.pdf" }).className).not.toContain("font-mono");
  });
});
