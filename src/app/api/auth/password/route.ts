import { changePassword } from "@/api/auth/password/handler";

export async function POST(request: Request) {
  return changePassword(request);
}
