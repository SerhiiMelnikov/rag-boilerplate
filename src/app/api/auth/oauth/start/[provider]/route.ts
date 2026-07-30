import { oauthStart } from "@/api/auth/oauth/start/handler";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return oauthStart(request, provider);
}
