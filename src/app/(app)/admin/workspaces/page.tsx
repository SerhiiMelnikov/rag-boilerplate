import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WorkspacesManager } from "@/components/admin/workspaces-manager";

export default async function WorkspacesPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <WorkspacesManager />;
}
