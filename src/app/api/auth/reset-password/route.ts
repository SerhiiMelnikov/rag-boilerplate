import { resetPassword } from "@/api/auth/reset-password/handler";

export async function POST(request: Request) {
  return resetPassword(request);
}
