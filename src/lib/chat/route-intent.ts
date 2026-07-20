import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getChatModel } from "@/lib/providers";
import { isProviderError } from "@/lib/providers/types";

export type Intent = { kind: "image"; query: string; count?: number } | { kind: "text" };

const ROUTER_PROMPT =
  "Classify the user's request. If they want to SEE or FIND an image, photo, " +
  "picture, diagram, or screenshot, respond with exactly \"IMAGE|<count>|<a short " +
  "description of what they want to see>\", where <count> is the number of images " +
  "they explicitly asked for as a digit, or \"-\" if they did not name a number. " +
  "Otherwise respond with exactly \"TEXT\". Output only that one line, nothing else.";

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

  const strict = /^IMAGE\|([^|]*)\|([\s\S]*)$/i.exec(out);
  if (strict) {
    const n = Number.parseInt(strict[1].trim(), 10);
    const count = Number.isInteger(n) && n > 0 ? n : undefined;
    const desc = strict[2].trim();
    return { kind: "image", query: desc.length > 0 ? desc : userMessage, count };
  }
  // Lenient recovery: the model tagged it IMAGE but did not follow the pipe format
  // (e.g. a legacy "IMAGE: ..."). Treat it as an image request with no explicit
  // count rather than misrouting a clear image ask to the text path.
  if (/^IMAGE\b/i.test(out)) {
    const desc = out.replace(/^IMAGE\b[\s:|-]*/i, "").trim();
    return { kind: "image", query: desc.length > 0 ? desc : userMessage };
  }
  return { kind: "text" };
}
