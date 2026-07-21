import { submitVerification } from "@/api/auth/verify/handler";

export async function POST(request: Request) {
  return submitVerification(request);
}
