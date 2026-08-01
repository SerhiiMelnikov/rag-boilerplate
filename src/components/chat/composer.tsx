"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMediaQuery } from "@/components/ui/use-media-query";

export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  focusSignal = 0,
  placeholder = "Ask your documents a question…",
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSubmit: () => void;
  busy: boolean;
  // Bumped by whoever wants the box focused ("New chat"). A counter rather than a
  // boolean, so a second request focuses again.
  focusSignal?: number;
  placeholder?: string;
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
    event.preventDefault();
    send();
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
      <div className="mx-auto flex w-full max-w-[68ch] items-end gap-2 px-4 py-3 md:px-6">
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
        <Button type="submit" aria-label="Send" disabled={!canSend} className="flex-none px-3">
          {busy ? <Spinner label="Sending" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
    </form>
  );
}
