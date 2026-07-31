import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Rail } from "@/components/shell/rail";
import { MobileNav } from "@/components/shell/mobile-nav";
import { PanelProvider } from "@/components/shell/panel-context";

// Server-side guard for the whole app group; redirects anonymous users.
// Unchanged from before the redesign — this package touches no authorisation.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <PanelProvider>
      <div className="flex h-screen flex-col">
        <div className="flex min-h-0 flex-1">
          <Rail
            email={session.user.email ?? ""}
            role={session.user.role}
            isSuperAdmin={session.user.isSuperAdmin}
          />
          {/* min-w-0 is load-bearing: without it a wide table or a long unbroken
              string pushes the rail off screen instead of scrolling inside. */}
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
        </div>
        <MobileNav
          email={session.user.email ?? ""}
          role={session.user.role}
          isSuperAdmin={session.user.isSuperAdmin}
        />
      </div>
    </PanelProvider>
  );
}
