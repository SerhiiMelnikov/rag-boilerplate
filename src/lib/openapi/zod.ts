import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Extend zod once (idempotent, global) so every schema can carry .openapi() metadata.
// All openapi schema files import z from HERE, not from "zod" directly.
extendZodWithOpenApi(z);
export { z };
