"use client";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

// Public API docs. Not under the (app) auth group. Scalar is self-hosted (bundled), no CDN.
export default function DocsPage() {
  return <ApiReferenceReact configuration={{ url: "/api/openapi.json" }} />;
}
