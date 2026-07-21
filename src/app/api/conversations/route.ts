import { listConversationsResponse, createConversationResponse } from "@/api/conversations/handler";

export async function GET(request: Request) {
  return listConversationsResponse(request);
}

export async function POST(request: Request) {
  return createConversationResponse(request);
}
