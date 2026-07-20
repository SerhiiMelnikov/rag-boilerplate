import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuestionsManager } from "@/components/admin/eval/questions-manager";
import { RunsPanel } from "@/components/admin/eval/runs-panel";

export default async function EvaluationPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return (
    <>
      <QuestionsManager />
      <RunsPanel />
    </>
  );
}
