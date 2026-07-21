import { handleChat } from "@/api/chat/handler";

export async function POST(request: Request) {
  return handleChat(request);
}
