// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock Scalar's React wrapper: rendering the real component under jsdom is heavy
// (it mounts a full Vue app internally) and irrelevant to what we're testing here —
// that DocsPage wires the spec URL into the config shape the installed version expects.
vi.mock("@scalar/api-reference-react", () => ({
  ApiReferenceReact: (props: { configuration: unknown }) => (
    <div data-testid="scalar-stub" data-configuration={JSON.stringify(props.configuration)} />
  ),
}));

import DocsPage from "./page";

describe("DocsPage", () => {
  it("points Scalar's ApiReferenceReact at the generated openapi.json spec", () => {
    const { getByTestId } = render(<DocsPage />);
    const stub = getByTestId("scalar-stub");
    const configuration = JSON.parse(stub.getAttribute("data-configuration") ?? "{}");
    expect(configuration.url).toBe("/api/openapi.json");
  });
});
