import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FilesManager } from "@/components/admin/files-manager";

export default async function FilesPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <FilesManager />;
}
