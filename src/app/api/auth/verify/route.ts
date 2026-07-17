import { submitVerification } from "./handler";

export async function POST(request: Request) {
  return submitVerification(request);
}
