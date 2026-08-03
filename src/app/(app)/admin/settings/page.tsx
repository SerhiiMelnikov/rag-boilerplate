import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ModelsForm } from "@/components/admin/settings/models-form";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <ModelsForm />;
}
