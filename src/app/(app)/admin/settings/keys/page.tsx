import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { KeysForm } from "@/components/admin/settings/keys-form";

export default async function SettingsKeysPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <KeysForm />;
}
