// Plain shared types for the eval subsystem. Kept import-free so both the Drizzle
// schema (which types its jsonb columns with these) and the eval modules can use
// them without a circular import.
export interface EvalSettingsSnapshot {
  topK: number;
  minSimilarity: number;
  contextTokenBudget: number;
  chatProvider: string;
  chatModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  temperature: number;
  systemPrompt: string;
}

export interface EvalAggregate {
  avgRecall: number;
  avgPrecision: number;
  avgMrr: number;
  avgJudgeScore: number;
  passRate: number;
  questionCount: number;
}

export interface RetrievedDoc {
  documentId: string;
  filename: string;
  score: number;
}
