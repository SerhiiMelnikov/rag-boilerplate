import { requirePageAdmin } from "../../guards";
import { WorkspacesManager } from "@/components/admin/workspaces-manager";

export default async function WorkspacesPage() {
  await requirePageAdmin();
  return <WorkspacesManager />;
}
