import { requirePageAdmin } from "../../../guards";
import { AccessForm } from "@/components/admin/settings/access-form";

export default async function SettingsAccessPage() {
  await requirePageAdmin();
  return <AccessForm />;
}
