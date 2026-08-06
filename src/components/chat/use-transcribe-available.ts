"use client";

import { useEffect, useState } from "react";

// Whether the server can actually transcribe right now — a speech-capable
// provider selected, with a model and a key — not merely whether this build
// ships one. A microphone rendered on the weaker fact is a button that fails on
// press, which is the defect package 6C-1 existed to remove.
//
// Starts false on every render, including the server's: the alternative is a
// hydration mismatch, since the server cannot know the answer either.
export function useTranscribeAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/chat/transcribe");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAvailable(data.available === true);
      } catch {
        // A failed probe means no microphone. Never a visible error: the user
        // did not ask for anything yet.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return available;
}
