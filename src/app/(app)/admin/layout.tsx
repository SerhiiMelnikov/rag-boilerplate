"use client";

import { usePathname } from "next/navigation";
import { Panel } from "@/components/shell/panel";
import { PanelSubnav } from "@/components/shell/panel-subnav";
import { MobileHeader } from "@/components/shell/mobile-header";
import { activeGroup } from "@/components/shell/nav-config";

// One layout gives all eight admin screens the same panel. Per-page chrome was how
// they drifted apart in the first place, and how one of them could go missing.
//
// No auth check here on purpose: each admin page still calls its own guard, but
// it is requirePageAdmin/requirePageSuperAdmin from ../../guards -- the same
// database-backed check the (app) layout above already runs, not next-auth's
// `auth()`. This layout adds no additional guard and changes no authorisation.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const group = activeGroup(pathname);
  // The panel is worth rendering only when it would show something: the switcher
  // (workspace-scoped groups) or a sub-nav of more than one entry. People and
  // Account have neither — a blank bordered column, or an empty drawer, is worse
  // than no panel at all.
  const hasPanelContent = group ? group.workspaceScoped || group.items.length > 1 : false;

  return (
    <>
      {hasPanelContent && (
        <Panel label="Admin sections">
          <PanelSubnav />
        </Panel>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* MobileHeader is the panel's drawer trigger, not a title bar: with no Panel
            mounted, tapping it would flip aria-expanded on nothing to open, and leave
            `open` set for whatever route mounts a Panel next. Keep this gated on the
            same condition as Panel above — never one without the other. */}
        {hasPanelContent && <MobileHeader />}
        {children}
      </div>
    </>
  );
}
