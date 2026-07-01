import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

// Anthropic has no embeddings API; chat + vision only.
export function anthropicChat(apiKey: string, model: string): LanguageModel {
  return createAnthropic({ apiKey })(model);
}
