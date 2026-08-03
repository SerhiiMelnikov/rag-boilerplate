import { requirePageAdmin } from "../../guards";
import { ModelsForm } from "@/components/admin/settings/models-form";

export default async function SettingsPage() {
  await requirePageAdmin();
  return <ModelsForm />;
}
