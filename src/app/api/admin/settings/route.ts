import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { getAdminSettings, updateSettings, settingsPatchSchema } from "@/lib/config/settings-service";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json(await getAdminSettings());
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
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
  return Response.json(await updateSettings(parsed.data));
}
