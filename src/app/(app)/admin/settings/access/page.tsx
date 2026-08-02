import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccessForm } from "@/components/admin/settings/access-form";

export default async function SettingsAccessPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <AccessForm />;
}
