import { listQuestionsResponse, createQuestionResponse } from "@/api/admin/evaluation/questions/handler";

export async function GET() {
  return listQuestionsResponse();
}

export async function POST(request: Request) {
  return createQuestionResponse(request);
}
