import { MessageSquare } from "lucide-react";
import { ProfileMenu } from "./profile-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Top navigation bar: brand on the left, the active-workspace switcher grouped
// with the Profile menu on the right (hidden when there is nothing to switch between).
export function AppBar({
  email,
  role,
  isSuperAdmin,
}: {
  email: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <a href="/" className="flex items-center gap-2 font-semibold">
        <MessageSquare className="h-5 w-5" /> RAG Chat
      </a>
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher />
        <ProfileMenu email={email} role={role} isSuperAdmin={isSuperAdmin} />
      </div>
    </header>
  );
}
