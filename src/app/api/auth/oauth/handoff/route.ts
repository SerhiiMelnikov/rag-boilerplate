import { oauthHandoff } from "@/api/auth/oauth/handoff/handler";

export async function GET(request: Request) {
  return oauthHandoff(request);
}
