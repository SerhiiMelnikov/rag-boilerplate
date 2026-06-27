import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <SettingsForm />;
}
