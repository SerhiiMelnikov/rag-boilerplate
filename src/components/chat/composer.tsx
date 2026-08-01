"use client";

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
  placeholder = "Ask your documents a question…",
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSubmit: () => void;
  busy: boolean;
  placeholder?: string;
}) {
  // Enter sends only where a real keyboard and a pointer exist. On a touch keyboard
  // the return key is the only way to start a new paragraph — there is no Shift to
  // hold — so taking it would make this a single-line box in practice.
  const finePointer = useMediaQuery("(pointer: fine)", true);
  const canSend = value.trim().length > 0 && !busy;

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
