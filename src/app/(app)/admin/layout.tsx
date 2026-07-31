import { Panel } from "@/components/shell/panel";
import { PanelSubnav } from "@/components/shell/panel-subnav";
import { MobileHeader } from "@/components/shell/mobile-header";

// One layout gives all eight admin screens the same panel. Per-page chrome was how
// they drifted apart in the first place, and how one of them could go missing.
//
// No auth check here on purpose: each admin page keeps its own `auth()` guard, and
// this package changes no authorisation.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Panel label="Admin sections">
        <PanelSubnav />
      </Panel>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileHeader />
        {children}
      </div>
    </>
  );
}
