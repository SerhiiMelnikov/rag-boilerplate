"use client";

import { useEffect, useRef, useState } from "react";
import { speakableText } from "@/lib/voice/speakable-text";
import { completedSentences } from "@/lib/voice/sentences";
import { detectSpeechLang } from "@/lib/voice/lang";
import { browserSpeechEngine, type SpeechEngine } from "./speech-engine";

// Speaks an assistant answer aloud, sentence by sentence, while it streams.
//
// Normalise the WHOLE accumulated answer first, then split it — never the
// reverse. A fenced code block opens in one streamed chunk and closes several
// chunks later, so no single sentence contains a matched pair of fences; split
// first and the body of the block gets read out line by line.
//
// De-duplication is by COUNT, not by content: the hook remembers how many
// sentences it has already spoken and takes the tail beyond that. Matching on
// text would swallow a sentence that legitimately repeats within one answer.
//
// `engine` must be referentially stable across renders. The unmount/replace
// cleanup below is keyed on engine identity ([active]), so a caller that
// builds a new engine object inline on every render would trigger that
// cleanup's cancel() constantly and the hook would never get to speak
// anything. The default, browser-built engine is stable (built once via
// useState's lazy initialiser); a caller supplying its own must memoise it.
//
// In dev, Next's reactStrictMode (on by default, not overridden in this repo)
// double-invokes effects on mount: mount, run effects, simulate an unmount
// (running cleanups, including this hook's cancel()), then mount again. The
// sentences already queued to speak by the first pass get cancelled by that
// interposed cleanup and are not re-queued by the second pass, because
// `spoken.current` (a ref) survives the double-invoke and already counts them
// as spoken. Net effect: the opening sentence(s) of an answer can go unspoken
// in dev only. This is a StrictMode artifact, not a hook bug — it does not
// happen in production, and jsdom (used by this file's tests) does not
// double-invoke effects, so it is invisible to the test suite too.
export function useSpokenAnswer({
  answer,
  status,
  enabled,
  turnKey,
  engine,
}: {
  answer: string;
  status: "ready" | "submitted" | "streaming" | "error";
  enabled: boolean;
  turnKey: string;
  engine?: SpeechEngine | null;
}): void {
  // Built once. The lazy useState initialiser runs on the server too, where
  // browserSpeechEngine() returns null rather than touching window.
  const [fallback] = useState<SpeechEngine | null>(() => (engine === undefined ? browserSpeechEngine() : null));
  const active = engine !== undefined ? engine : fallback;

  const spoken = useRef(0);

  // Sending silences the answer being read RIGHT NOW. turnKey alone is too late:
  // the new assistant message does not exist yet at that moment, so turnKey still
  // points at the old answer and its queued sentences would keep playing over the
  // top of the next question. status reaches "submitted" immediately.
  useEffect(() => {
    if (status === "submitted") active?.cancel();
  }, [status, active]);

  // A new turn silences the previous one and restarts the count.
  const lastTurn = useRef(turnKey);
  useEffect(() => {
    if (lastTurn.current === turnKey) return;
    lastTurn.current = turnKey;
    spoken.current = 0;
    active?.cancel();
  }, [turnKey, active]);

  // wasEnabled distinguishes a real off-to-on toggle from the initial mount: this
  // effect, like every effect, also fires on mount, and mounting already enabled
  // (the ordinary case of a fresh streaming turn) must NOT adopt the answer-so-far
  // — that would silently skip whatever sentence had already completed by the
  // first render, which is exactly the answer this hook exists to speak.
  const wasEnabled = useRef(enabled);

  // Disabling stops speech immediately and resets wasEnabled, so a later re-enable
  // adopts the answer as it then stands instead of replaying it. This is its own
  // effect, keyed only on [enabled, active]: it used to live in the effect below
  // (deps [answer, status, enabled, active]), which re-runs on every streamed
  // token — for everyone who has the toggle off (the default), that meant a
  // cancel() browser-API call once per token. Idempotent, but wasted, on every
  // page load for a feature nobody enabled.
  useEffect(() => {
    if (!enabled) {
      active?.cancel();
      wasEnabled.current = false;
    }
  }, [enabled, active]);

  useEffect(() => {
    if (!enabled || !active) return;

    const streaming = status === "streaming" || status === "submitted";
    const sentences = completedSentences(speakableText(answer), { flush: !streaming });

    // Switching on adopts the answer as it stands, so turning the toggle on does
    // not replay what is already on screen. This MUST read the same `sentences`
    // list (same flush flag) the speak loop below uses: computing the adopted
    // count separately (e.g. always with flush: false) lets the two disagree by
    // exactly the trailing fragment whenever the toggle flips while status isn't
    // "streaming"/"submitted" — flush is true there, so the loop below would
    // immediately speak that fragment even though the adopt branch didn't count
    // it, which is the on-screen replay this comment says must not happen.
    if (!wasEnabled.current) {
      spoken.current = sentences.length;
      wasEnabled.current = true;
    }

    // The browser's UI language is only the fallback now: the answer's own
    // script decides, per sentence, so a mixed answer reads correctly on both
    // halves. See src/lib/voice/lang.ts for why this is a heuristic.
    const fallbackLang = typeof navigator !== "undefined" ? navigator.language : "en";
    for (const sentence of sentences.slice(spoken.current)) {
      active.speak(sentence, detectSpeechLang(sentence) ?? fallbackLang);
    }
    spoken.current = sentences.length;
  }, [answer, status, enabled, active]);

  // Leaving the page must not leave a voice talking to an empty room.
  useEffect(() => () => active?.cancel(), [active]);
}
