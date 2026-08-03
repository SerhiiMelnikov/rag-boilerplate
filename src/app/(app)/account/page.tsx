import { requirePageUser } from "../guards";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

// One page for "things about me". Password is the only section today; email and
// active sessions are the obvious next two, and they now have somewhere to land
// instead of becoming /account/email and /account/sessions.
//
// No Panel on this route, and so no MobileHeader either: MobileHeader is the
// panel's drawer trigger, not a title bar, and a trigger with nothing to open
// would tap dead while still flipping its own aria-expanded. PageHeader below
// already gives the page its heading.
export default async function AccountPage() {
  const user = await requirePageUser();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader className="max-w-xl" title="Account" description={user.email} />
      <PageBody className="max-w-xl">
        <Card title="Password" description="Changing it signs out every other session.">
          <PasswordForm />
        </Card>
      </PageBody>
    </div>
  );
}
