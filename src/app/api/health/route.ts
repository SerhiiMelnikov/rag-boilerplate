import { healthCheck } from "./handler";

// Never cache: a cached health response would report a dead database as healthy.
export const dynamic = "force-dynamic";

export async function GET() {
  return healthCheck();
}
