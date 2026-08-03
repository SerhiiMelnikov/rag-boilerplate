import { MessageSquare, Files, BarChart3, Settings, Users, UserCircle, type LucideIcon } from "lucide-react";

export type NavRole = "user" | "admin" | "superAdmin";
export type NavGroupId = "chat" | "knowledge" | "insights" | "settings" | "people" | "account";

export interface NavItem {
  label: string;
  href: string;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  icon: LucideIcon;
  /** Where a rail click lands. For `account` this is where the popover's own entry goes. */
  href: string;
  requires: NavRole;
  /** Does the active workspace change what this section shows? */
  workspaceScoped: boolean;
  /** Panel sub-nav. The panel renders one only when there is more than a single entry. */
  items: NavItem[];
}

// One declaration for the whole shell: the rail, the panel sub-nav, the mobile
// bottom bar and the role gating all derive from this array. Before it, eight
// admin destinations were hardcoded as anchors inside a dropdown, and nothing
// could tell you whether a page was reachable.
export const NAV: NavGroup[] = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    href: "/",
    requires: "user",
    workspaceScoped: true,
    items: [],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: Files,
    href: "/admin/files",
    requires: "admin",
    workspaceScoped: true,
    items: [
      { label: "Files", href: "/admin/files" },
      { label: "Workspaces", href: "/admin/workspaces" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    icon: BarChart3,
    href: "/admin/analytics",
    requires: "admin",
    workspaceScoped: false,
    items: [
      { label: "Feedback", href: "/admin/analytics" },
      { label: "Usage", href: "/admin/usage" },
      { label: "Evaluation", href: "/admin/evaluation" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: "/admin/settings",
    requires: "admin",
    workspaceScoped: false,
    items: [
      { label: "Models", href: "/admin/settings" },
      // Nested under /admin/settings rather than a top-level route: the panel is
      // the navigation here, the same way it already is for Knowledge and Insights.
      { label: "Answering", href: "/admin/settings/answering" },
      { label: "Access & email", href: "/admin/settings/access" },
    ],
  },
  {
    id: "people",
    // Kept out of Settings deliberately: this is the only screen where an admin can
    // do irreversible harm to another person's account.
    label: "People",
    icon: Users,
    href: "/admin/users",
    requires: "superAdmin",
    workspaceScoped: false,
    items: [{ label: "Users", href: "/admin/users" }],
  },
  {
    id: "account",
    label: "Account",
    icon: UserCircle,
    href: "/account",
    requires: "user",
    workspaceScoped: false,
    items: [],
  },
];

export function visibleGroups(role: "admin" | "user", isSuperAdmin: boolean): NavGroup[] {
  return NAV.filter((group) => {
    if (group.requires === "user") return true;
    if (group.requires === "admin") return role === "admin";
    return isSuperAdmin;
  });
}

// Longest match wins. A plain prefix scan would let the chat's "/" claim every
// route, and would stop at /admin/settings for /admin/settings/answering — a
// sub-item sharing its group's href as a prefix — instead of matching it.
export function activeGroup(pathname: string): NavGroup | undefined {
  let best: NavGroup | undefined;
  let bestLength = -1;

  for (const group of NAV) {
    for (const href of [group.href, ...group.items.map((item) => item.href)]) {
      const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
      if (matches && href.length > bestLength) {
        best = group;
        bestLength = href.length;
      }
    }
  }

  return best;
}
