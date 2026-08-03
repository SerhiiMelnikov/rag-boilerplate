import { requirePageSuperAdmin } from "../../guards";
import { UsersManager } from "@/components/admin/users-manager";

export default async function UsersPage() {
  const user = await requirePageSuperAdmin();
  return <UsersManager currentUserId={user.id} />;
}
