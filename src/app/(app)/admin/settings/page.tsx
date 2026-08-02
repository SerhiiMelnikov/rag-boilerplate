import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AnsweringForm } from "@/components/admin/settings/answering-form";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <AnsweringForm />;
}
