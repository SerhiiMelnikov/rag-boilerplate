import { requirePageAdmin } from "../../guards";
import { FilesManager } from "@/components/admin/files-manager";

export default async function FilesPage() {
  await requirePageAdmin();
  return <FilesManager />;
}
