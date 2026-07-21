import { listQuestionsResponse, createQuestionResponse } from "@/api/admin/evaluation/questions/handler";

export async function GET(request: Request) {
  return listQuestionsResponse(request);
}

export async function POST(request: Request) {
  return createQuestionResponse(request);
}
