// MUST be first: src/lib/db/client.ts (imported transitively by nearly every
// src/api/** handler) reads process.env.DATABASE_URL at module-load time and
// throws if it is unset. Any import above this line that transitively reaches
// db/client.ts would run before dotenv has populated process.env.
import "dotenv/config";

import { serve } from "@hono/node-server";
import { createServer } from "./routes";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: createServer().fetch, port });
console.log(`API server listening on :${port}`);
