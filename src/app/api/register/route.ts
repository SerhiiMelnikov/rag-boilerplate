import { registerUser } from "./handler";

export async function POST(request: Request) {
  return registerUser(request);
}
