import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppBar } from "@/components/app-bar";

// Server-side guard for the whole app group; redirects anonymous users.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="flex h-screen flex-col">
      <AppBar email={session.user.email ?? ""} role={session.user.role} isSuperAdmin={session.user.isSuperAdmin} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
