import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getChatModel } from "@/lib/providers";
import { isProviderError } from "@/lib/providers/types";

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
// out), so it works with every configured chat provider. Unparseable output falls
// back to the normal document-RAG path.
//
// Provider errors propagate so the caller can report them: a missing key or an
// exhausted quota is an operator problem, not a "this request was about text"
// classification. Any other failure still degrades to the text path (the safe
// default) but is logged — silently answering with text is how an exhausted quota
// looked exactly like a user asking a non-image question.
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

  let out: string;
  try {
    out = (await generate(userMessage)).trim();
  } catch (err) {
    if (isProviderError(err)) throw err;
    console.error("Intent routing failed; falling back to the text path.", err);
    return { kind: "text" };
  }

  if (/^IMAGE:/i.test(out)) {
    const query = out.replace(/^IMAGE:/i, "").trim();
    return { kind: "image", query: query.length > 0 ? query : userMessage };
  }
  return { kind: "text" };
}
