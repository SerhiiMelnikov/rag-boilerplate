// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthCard } from "@/components/auth/auth-card";

describe("AuthCard", () => {
  it("renders the brand, the title as an h1, the description, body and footer", () => {
    render(
      <AuthCard title="Sign in" description="Ask questions about your team's documents." footer={<a href="/register">Create one</a>}>
        <p>form</p>
      </AuthCard>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Ask questions about your team's documents.")).toBeInTheDocument();
    expect(screen.getByText("RAG Chat")).toBeInTheDocument();
    expect(screen.getByText("form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one" })).toBeInTheDocument();
  });

  it("omits the description and footer when they are not given", () => {
    render(
      <AuthCard title="Link expired">
        <p>body</p>
      </AuthCard>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Link expired" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
