// Whether the assistant speaks its answers aloud, remembered per device.
//
// Per device, not per account, and that is deliberate rather than lazy: a synced
// preference would make a work laptop start talking because the phone had it on.
//
// This is the first use of localStorage in the repo. Both helpers are guarded the
// way src/lib/workspaces/cookie.ts guards its browser-only helper — this module is
// imported by a client component, which Next also renders on the server, and
// touching window there throws and takes the page with it. Both also swallow a
// throwing storage: Safari in private mode denies access and throws on read, and
// a storage failure must never break the chat.
export const SPEAK_ANSWERS_KEY = "speak_answers";

export function readSpeakAnswers(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SPEAK_ANSWERS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSpeakAnswers(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPEAK_ANSWERS_KEY, on ? "1" : "0");
  } catch {
    // Storage denied. The toggle still works for this page's lifetime.
  }
}
