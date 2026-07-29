import { forgotPassword } from "@/api/auth/forgot-password/handler";

export async function POST(request: Request) {
  return forgotPassword(request);
}
