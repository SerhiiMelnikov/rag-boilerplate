import { verifyEmail } from "./handler";

// Never cache: a cached redirect would verify one person and then claim success for
// everyone who follows.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return verifyEmail(request);
}
