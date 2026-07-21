import { loginResponse } from "@/api/auth/login/handler";

export async function POST(request: Request) {
  return loginResponse(request);
}
