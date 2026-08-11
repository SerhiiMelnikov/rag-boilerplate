import { requirePageAdmin } from "../../guards";
import { Page } from "@/components/ui/page";
import { QuestionsManager } from "@/components/admin/eval/questions-manager";
import { RunsPanel } from "@/components/admin/eval/runs-panel";

export default async function EvaluationPage() {
  await requirePageAdmin();
  return (
    // One scroller for the whole route. Both panels used to bring their own
    // container, which put two scroll contexts in one flex column and left the
    // runs list squeezed below the questions with no way to scroll itself.
    <Page
      width="wide"
      title="Evaluation"
      description="Golden questions and the runs scored against them."
      contentClassName="space-y-4"
    >
      <QuestionsManager />
      <RunsPanel />
    </Page>
  );
}
