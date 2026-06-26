// Local heuristic token estimator. Intentionally does NOT call the model API
// (budget efficiency): ~4 characters per token is a good-enough approximation
// for context-budget trimming.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
