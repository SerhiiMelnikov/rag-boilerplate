import { handleTranscribe, transcribeAvailability } from "@/api/chat/transcribe/handler";

export async function POST(request: Request) {
  return handleTranscribe(request);
}

export async function GET(request: Request) {
  return transcribeAvailability(request);
}
