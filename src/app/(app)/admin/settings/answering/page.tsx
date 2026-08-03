import { requirePageAdmin } from "../../../guards";
import { AnsweringForm } from "@/components/admin/settings/answering-form";

export default async function SettingsAnsweringPage() {
  await requirePageAdmin();
  return <AnsweringForm />;
}
