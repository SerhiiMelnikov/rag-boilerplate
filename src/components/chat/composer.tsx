"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMediaQuery } from "@/components/ui/use-media-query";
import type { MicState } from "./use-microphone";

const MIC_LABELS: Record<MicState, string> = {
  idle: "Ask by voice",
  requesting: "Requesting the microphone",
  recording: "Stop recording",
  transcribing: "Transcribing",
};

// M:SS. The readout is the only thing telling a user the 60-second cap exists.
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  focusSignal = 0,
  placeholder = "Ask your documents a question…",
  speakAnswers,
  onToggleSpeakAnswers,
  onMicrophone,
  micState,
  micElapsedMs,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSubmit: () => void;
  busy: boolean;
  // Bumped by whoever wants the box focused ("New chat"). A counter rather than a
  // boolean, so a second request focuses again.
  focusSignal?: number;
  placeholder?: string;
  // Whether spoken answers are currently on. Undefined and no-handler are treated
  // the same as "off" for rendering the icon, but the toggle itself only renders at
  // all when onToggleSpeakAnswers is supplied — an unavailable browser gets no
  // handler from its caller, and so sees no switch at all.
  speakAnswers?: boolean;
  onToggleSpeakAnswers?: () => void;
  // The microphone renders only when a handler is supplied — the same contract
  // the speaker toggle uses. A platform that cannot record, or a server with no
  // speech provider, gets no control rather than one that fails on press.
  onMicrophone?: () => void;
  micState?: MicState;
  micElapsedMs?: number;
}) {
  // Enter sends only where a real keyboard and a pointer exist. On a touch keyboard
  // the return key is the only way to start a new paragraph — there is no Shift to
  // hold — so taking it would make this a single-line box in practice.
  const finePointer = useMediaQuery("(pointer: fine)", true);
  const canSend = value.trim().length > 0 && !busy;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Seeded at 0 — the value nobody has asked for anything at — rather than at the
  // incoming prop: "New chat" while a conversation is open clears the selection,
  // which remounts this component, and a request that arrives with the remount has
  // to land on the new box too. An ordinary page load carries 0 and so is silent;
  // stealing focus there would open the keyboard on a phone.
  const focused = useRef(0);

  useEffect(() => {
    if (focusSignal === focused.current) return;
    focused.current = focusSignal;
    textareaRef.current?.focus();
  }, [focusSignal]);

  // Textarea's autoGrow measures on the element's own input event, and clearing the
  // value through React fires none — so a sent multi-line message left the box tall
  // and empty until the next keystroke. Dropping the inline height hands the size
  // back to the stylesheet (rows=1 plus the touch minimum); typing takes over again
  // from there, with autoGrow's uncontrolled contract untouched.
  useEffect(() => {
    if (value === "") {
      const textarea = textareaRef.current;
      if (textarea) textarea.style.height = "";
    }
  }, [value]);

  function send() {
    if (canSend) onSubmit();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || !finePointer) return;
    // Take the key only when it is going to send. While a turn is in flight — or on
    // an empty box — swallowing Enter without sending would leave the user unable to
    // start a new paragraph and with no feedback for the keystroke either.
    if (!canSend) return;
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex-none border-t border-border bg-bg"
    >
      {/* Same measure as the transcript, so the field lines up under the answers. */}
      {/* Tracks the transcript's width exactly — a composer narrower than the answers
          above it reads as a different column. */}
      <div className="mx-auto flex w-full max-w-[68ch] items-end gap-2 px-4 py-3 md:px-6 lg:max-w-[86ch] 2xl:max-w-[100ch]">
        <Textarea
          ref={textareaRef}
          autoGrow
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Message"
          className="max-h-[200px] overflow-y-auto"
        />
        {onMicrophone && (
          <Button
            type="button"
            variant="ghost"
            onClick={onMicrophone}
            disabled={busy || micState === "requesting" || micState === "transcribing"}
            aria-label={MIC_LABELS[micState ?? "idle"]}
            className="flex-none px-3"
          >
            {micState === "recording" ? (
              <span className="flex items-center gap-1.5">
                <Square className="h-4 w-4" />
                <span className="tabular-nums text-xs">{formatElapsed(micElapsedMs ?? 0)}</span>
              </span>
            ) : micState === "requesting" || micState === "transcribing" ? (
              // `decorative`, not `label`: the Button already carries the
              // accessible name, and a labelled Spinner inside it would give the
              // control two identical names — getByLabelText then finds two
              // elements and throws. Spinner has this prop for exactly this case.
              <Spinner decorative />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}
        {onToggleSpeakAnswers && (
          <Button
            type="button"
            variant="ghost"
            onClick={onToggleSpeakAnswers}
            aria-pressed={speakAnswers === true}
            aria-label={speakAnswers ? "Stop speaking answers" : "Speak answers aloud"}
            className="flex-none px-3"
          >
            {speakAnswers ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        )}
        <Button type="submit" aria-label="Send" disabled={!canSend} className="flex-none px-3">
          {busy ? <Spinner label="Sending" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
    </form>
  );
}
