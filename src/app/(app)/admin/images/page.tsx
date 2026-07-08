import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImagesManager } from "@/components/admin/images-manager";

export default async function ImagesPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return <ImagesManager />;
}
