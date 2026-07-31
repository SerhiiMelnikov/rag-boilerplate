import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";

// Filled in by Task 11: the change-password form moves here from
// /account/password, which is deleted.
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <PageHeader title="Account" description={session.user.email ?? undefined} />;
}
