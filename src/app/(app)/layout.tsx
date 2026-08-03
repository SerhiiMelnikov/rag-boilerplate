import { requirePageUser } from "./guards";
import { Rail } from "@/components/shell/rail";
import { MobileNav } from "@/components/shell/mobile-nav";
import { PanelProvider } from "@/components/shell/panel-context";

// Server-side guard for the whole app group. Reads the user row rather than the
// session token, so a block, a deletion, a demotion or a password-change cut-off
// takes effect on the next navigation instead of when the 30-day cookie expires.
// That also means Rail below receives the CURRENT role: a demoted admin stops
// seeing admin navigation, rather than seeing it and collecting 403s behind it.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  return (
    <PanelProvider>
      <div className="flex h-screen flex-col">
        <div className="flex min-h-0 flex-1">
          <Rail
            email={user.email}
            role={user.role}
            isSuperAdmin={user.isSuperAdmin}
          />
          {/* min-w-0 is load-bearing: without it a wide table or a long unbroken
              string pushes the rail off screen instead of scrolling inside. */}
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
        </div>
        <MobileNav
          email={user.email}
          role={user.role}
          isSuperAdmin={user.isSuperAdmin}
        />
      </div>
    </PanelProvider>
  );
}
