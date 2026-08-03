import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// connect_timeout bounds the CONNECT phase only (queries are unaffected). The
// driver's default is 30s, which is what a network black hole — a route that
// swallows packets rather than refusing them — costs GET /api/health before it
// can answer 503. Ten seconds is long enough for a cold cloud database and
// short enough that a health check still means something.
const queryClient = postgres(connectionString, { connect_timeout: 10 });
export const db = drizzle(queryClient, { schema });
