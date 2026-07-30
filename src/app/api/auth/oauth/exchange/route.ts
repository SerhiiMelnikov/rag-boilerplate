import { oauthExchange } from "@/api/auth/oauth/exchange/handler";

export async function POST(request: Request) {
  return oauthExchange(request);
}
