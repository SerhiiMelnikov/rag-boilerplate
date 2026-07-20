import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

// One shared registry. Schema and path modules register onto it for their side effects;
// document.ts imports them all, then generates from registry.definitions.
export const registry = new OpenAPIRegistry();
