import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { MobileHeader } from "@/components/shell/mobile-header";
import { PasswordForm } from "./password-form";

// One page for "things about me". Password is the only section today; email and
// active sessions are the obvious next two, and they now have somewhere to land
// instead of becoming /account/email and /account/sessions.
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MobileHeader />
      <PageHeader title="Account" description={session.user.email ?? undefined} />
      <PageBody className="max-w-xl">
        <Card title="Password" description="Changing it signs out every other session.">
          <PasswordForm />
        </Card>
      </PageBody>
    </div>
  );
}
