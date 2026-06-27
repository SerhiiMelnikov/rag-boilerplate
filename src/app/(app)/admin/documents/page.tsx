import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DocumentsManager } from "@/components/admin/documents-manager";

export default async function DocumentsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <DocumentsManager />;
}
