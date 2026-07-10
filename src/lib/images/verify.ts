import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getChatModel } from "@/lib/providers";
import { isProviderError } from "@/lib/providers/types";
import type { ImageSearchHit } from "./search";

// Captions are admin-authored (or vision-model generated) free text. Bound what we
// paste into the prompt so a pathological caption cannot blow up the request.
const MAX_CAPTION_CHARS = 500;

const VERIFY_PROMPT =
  "You decide which images match a user's request. You are given the request and a " +
  "numbered list of image descriptions. Reply with the numbers of the descriptions that " +
  "genuinely match the request, comma-separated, most relevant first. If none of them " +
  "match, reply with exactly \"NONE\". Output only that one line, nothing else.";

export interface VerifyImageMatchesDeps {
  generate?: (prompt: string) => Promise<string>;
}

// Parse a model reply like "3, 1" into zero-based indices, dropping anything out of
// range and any duplicate. Returns null when the reply is not a bare number list, so
// the caller can tell "the model said nothing usable" from "the model said none".
//
// Only a bare list is trusted. Mining digits out of prose would invert a negated
// reply ("images 2 and 3 do NOT match, only 1 does" would yield all three), which is
// exactly the kind of confident-but-wrong answer this verifier exists to prevent.
function parseIndices(reply: string, candidateCount: number): number[] | null {
  const text = reply.trim();
  if (/^none\.?$/i.test(text)) return [];
  if (!/^\d+(\s*,\s*\d+)*$/.test(text)) return null;
  const picked = text
    .split(",")
    .map((n) => Number(n.trim()) - 1)
    .filter((i) => i >= 0 && i < candidateCount);
  return picked.length > 0 ? [...new Set(picked)] : null;
}

// Cosine similarity between a short query and a verbose caption is a poor relevance
// gate: on real data a genuinely matching caption can score below an unrelated one, so
// no absolute threshold separates them. Instead we let the chat model read the captions
// and say which ones actually answer the request — the same one-cheap-call approach the
// intent router already uses.
//
// Never guesses: an unusable reply yields [] rather than presenting images we could not
// vouch for. Provider errors propagate so the caller can report them; any other failure
// degrades to [] but is logged, because this is the turn's second model call and a rate
// limit here would otherwise masquerade as "no image matched".
//
// The caller must apply the workspace allowlist BEFORE calling this: the verifier only
// ever sees in-scope captions, so an injected caption cannot pull in another
// workspace's image. That ordering is load-bearing.
export async function verifyImageMatches(
  queryText: string,
  hits: ImageSearchHit[],
  settings: RuntimeSettings,
  deps: VerifyImageMatchesDeps = {},
): Promise<ImageSearchHit[]> {
  if (hits.length === 0) return [];

  const generate =
    deps.generate ??
    (async (prompt: string) => {
      const { text } = await generateText({
        model: getChatModel(settings, "Image matching"),
        messages: [
          { role: "system", content: VERIFY_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      });
      return text;
    });

  const list = hits.map((h, i) => `${i + 1}. ${h.caption.slice(0, MAX_CAPTION_CHARS)}`).join("\n");
  const prompt = `Request: ${queryText}\n\n${list}`;

  let reply: string;
  try {
    reply = (await generate(prompt)).trim();
  } catch (err) {
    if (isProviderError(err)) throw err;
    console.error("Image relevance verification failed; reporting no match.", err);
    return [];
  }

  const indices = parseIndices(reply, hits.length);
  if (indices === null) {
    // A reply we cannot parse means the prompt contract drifted — worth noticing,
    // unlike a legitimate "NONE", which is a normal steady state.
    console.warn(`Unparseable image-verification reply: ${JSON.stringify(reply.slice(0, 120))}`);
    return [];
  }
  return indices.map((i) => hits[i]);
}
