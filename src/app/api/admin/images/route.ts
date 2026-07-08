import { uploadImage, listImagesResponse } from "./handler";

export async function POST(request: Request) {
  return uploadImage(request);
}

export async function GET() {
  return listImagesResponse();
}
