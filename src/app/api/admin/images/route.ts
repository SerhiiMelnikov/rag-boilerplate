import { after } from "next/server";
import { uploadImage, listImagesResponse } from "@/api/admin/images/handler";

export async function POST(request: Request) {
  return uploadImage(request, { schedule: (fn) => { after(fn); } });
}

export async function GET() {
  return listImagesResponse();
}
