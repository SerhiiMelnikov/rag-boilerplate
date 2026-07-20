import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuestionsManager } from "@/components/admin/eval/questions-manager";

export default async function EvaluationPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  // Task 9 will add a <RunsPanel /> below the questions manager to trigger
  // runs and inspect their results.
  return <QuestionsManager />;
}
