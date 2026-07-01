import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProviderKeysForm } from "@/components/admin/provider-keys-form";

export default async function KeysPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <ProviderKeysForm />;
}
