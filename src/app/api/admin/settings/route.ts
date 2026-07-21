import { getSettingsResponse, updateSettingsResponse } from "@/api/admin/settings/handler";

export async function GET(request: Request) {
  return getSettingsResponse(request);
}

export async function PUT(request: Request) {
  return updateSettingsResponse(request);
}
