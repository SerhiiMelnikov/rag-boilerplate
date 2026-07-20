import { listQuestionsResponse, createQuestionResponse } from "./handler";

export async function GET() {
  return listQuestionsResponse();
}

export async function POST(request: Request) {
  return createQuestionResponse(request);
}
