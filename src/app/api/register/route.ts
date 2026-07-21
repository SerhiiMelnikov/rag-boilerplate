import { registerUser } from "@/api/register/handler";

export async function POST(request: Request) {
  return registerUser(request);
}
