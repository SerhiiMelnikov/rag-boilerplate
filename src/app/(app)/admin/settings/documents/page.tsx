import { requirePageAdmin } from "../../../guards";
import { DocumentsForm } from "@/components/admin/settings/documents-form";

export default async function SettingsDocumentsPage() {
  await requirePageAdmin();
  return <DocumentsForm />;
}
