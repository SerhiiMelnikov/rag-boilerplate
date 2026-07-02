import { MessageSquare } from "lucide-react";
import { ProfileMenu } from "./profile-menu";

// Top navigation bar: brand on the left, the Profile menu on the right.
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
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <a href="/" className="flex items-center gap-2 font-semibold">
        <MessageSquare className="h-5 w-5" /> RAG Chat
      </a>
      <ProfileMenu email={email} role={role} isSuperAdmin={isSuperAdmin} />
    </header>
  );
}
