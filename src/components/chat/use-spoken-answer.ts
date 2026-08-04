"use client";

import { useEffect, useRef, useState } from "react";
import { speakableText } from "@/lib/voice/speakable-text";
import { completedSentences } from "@/lib/voice/sentences";
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
  const answerRef = useRef(answer);
  answerRef.current = answer;

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

  // Switching off stops mid-word. Switching on adopts the answer as it stands, so
  // turning the toggle on does not replay what is already on screen.
  //
  // wasEnabled distinguishes a real off-to-on toggle from the initial mount:
  // this effect, like every effect, also fires on mount, and mounting already
  // enabled (the ordinary case of a fresh streaming turn) must NOT adopt the
  // answer-so-far — that would silently skip whatever sentence had already
  // completed by the first render, which is exactly the answer this hook
  // exists to speak.
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    if (!enabled) {
      active?.cancel();
      wasEnabled.current = enabled;
      return;
    }
    if (!wasEnabled.current) {
      spoken.current = completedSentences(speakableText(answerRef.current)).length;
    }
    wasEnabled.current = enabled;
  }, [enabled, active]);

  useEffect(() => {
    if (!enabled || !active) return;
    const streaming = status === "streaming" || status === "submitted";
    const sentences = completedSentences(speakableText(answer), { flush: !streaming });
    const lang = typeof navigator !== "undefined" ? navigator.language : "en";
    for (const sentence of sentences.slice(spoken.current)) active.speak(sentence, lang);
    spoken.current = sentences.length;
  }, [answer, status, enabled, active]);

  // Leaving the page must not leave a voice talking to an empty room.
  useEffect(() => () => active?.cancel(), [active]);
}
