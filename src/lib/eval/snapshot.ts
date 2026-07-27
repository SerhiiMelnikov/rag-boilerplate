import type { RuntimeSettings } from "@/lib/config/settings-service";
import type { EvalSettingsSnapshot } from "./types";

// Project the specific RuntimeSettings fields that affect retrieval/generation into
// a persisted snapshot, so a run's results stay attributable to the exact settings
// used even if the admin changes settings again before the run finishes. Shared by
// the admin API and the CLI runner: two entry points computing this independently
// would drift, and runs from the two would stop being comparable.
export function buildSettingsSnapshot(s: RuntimeSettings): EvalSettingsSnapshot {
  return {
    topK: s.topK,
    minSimilarity: s.minSimilarity,
    contextTokenBudget: s.contextTokenBudget,
    chatProvider: s.chatProvider,
    chatModel: s.chatModel,
    embeddingProvider: s.embeddingProvider,
    embeddingModel: s.embeddingModel,
    temperature: s.temperature,
    systemPrompt: s.systemPrompt,
  };
}
