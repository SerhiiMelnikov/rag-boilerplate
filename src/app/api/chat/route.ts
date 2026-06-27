import { handleChat } from "./handler";

export async function POST(request: Request) {
  return handleChat(request);
}
