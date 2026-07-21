import { getSettingsResponse, updateSettingsResponse } from "@/api/admin/settings/handler";

export async function GET() {
  return getSettingsResponse();
}

export async function PUT(request: Request) {
  return updateSettingsResponse(request);
}
