import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { QuestionsManager } from "@/components/admin/eval/questions-manager";
import { RunsPanel } from "@/components/admin/eval/runs-panel";

export default async function EvaluationPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");
  return (
    <>
      <PageHeader
        className="mx-auto max-w-3xl"
        title="Evaluation"
        description="Golden questions and the runs scored against them."
      />
      {/* One scroller for the whole route. Both panels used to bring their own
          container, which put two scroll contexts in one flex column and left the
          runs list squeezed below the questions with no way to scroll itself. */}
      <PageBody className="mx-auto max-w-3xl space-y-4">
        <QuestionsManager />
        <RunsPanel />
      </PageBody>
    </>
  );
}
