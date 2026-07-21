import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { getAdminSettings, updateSettings, settingsPatchSchema } from "@/lib/config/settings-service";

export interface SettingsDeps {
  getAdmin?: typeof requireAdmin;
  getAdminSettingsFn?: typeof getAdminSettings;
  updateSettingsFn?: typeof updateSettings;
}

export async function getSettingsResponse(deps: SettingsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const getAdminSettingsFn = deps.getAdminSettingsFn ?? getAdminSettings;
  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json(await getAdminSettingsFn());
}

export async function updateSettingsResponse(request: Request, deps: SettingsDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const updateSettingsFn = deps.updateSettingsFn ?? updateSettings;
  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  return Response.json(await updateSettingsFn(parsed.data));
}
