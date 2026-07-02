import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UsersManager } from "@/components/admin/users-manager";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect("/");
  return <UsersManager currentUserId={session.user.id} />;
}
