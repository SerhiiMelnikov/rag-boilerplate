import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getChatModel } from "@/lib/providers";

export type Intent = { kind: "image"; query: string } | { kind: "text" };

const ROUTER_PROMPT =
  "Classify the user's request. If they want to SEE or FIND an image, photo, " +
  "picture, diagram, or screenshot, respond with exactly \"IMAGE: <a short " +
  "description of what they want to see>\". Otherwise respond with exactly " +
  "\"TEXT\". Output only that one line, nothing else.";

export interface RouteIntentDeps {
  generate?: (prompt: string) => Promise<string>;
}

// One cheap classification call before answering. Provider-agnostic (plain text
// out), so it works with every configured chat provider. Any failure or
// unparseable output falls back to the normal document-RAG path.
export async function routeIntent(
  userMessage: string,
  settings: RuntimeSettings,
  deps: RouteIntentDeps = {},
): Promise<Intent> {
  const generate =
    deps.generate ??
    (async (prompt: string) => {
      const { text } = await generateText({
        model: getChatModel(settings, "Intent routing"),
        messages: [
          { role: "system", content: ROUTER_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      });
      return text;
    });

  try {
    const out = (await generate(userMessage)).trim();
    if (/^IMAGE:/i.test(out)) {
      const query = out.replace(/^IMAGE:/i, "").trim();
      return { kind: "image", query: query.length > 0 ? query : userMessage };
    }
    return { kind: "text" };
  } catch {
    return { kind: "text" };
  }
}
