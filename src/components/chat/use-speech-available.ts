"use client";

import { useEffect, useState } from "react";

// Whether a voice actually exists, not merely whether the API does.
//
// Two cases make the naive check wrong. On several browsers the first
// getVoices() returns an empty array and the real list arrives later, announced
// by voiceschanged. And on Firefox under Linux with no speech-dispatcher
// installed, the API is present and the list never fills at all. Both must read
// as unavailable, because a toggle that flips a flag and produces silence is
// worse than no toggle.
//
// Starts false on every render, including the server's: the alternative is a
// hydration mismatch, since the server can never know what the browser has.
export function useSpeechAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const check = () => setAvailable(synth.getVoices().length > 0);
    check();
    synth.addEventListener("voiceschanged", check);
    return () => synth.removeEventListener("voiceschanged", check);
  }, []);

  return available;
}
