"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";

// Thumbs up/down. Clicking the active value again clears it (null).
export function Rating({ messageId, initial }: { messageId: string; initial: number | null }) {
  const [value, setValue] = useState<number | null>(initial);

  async function rate(next: 1 | -1) {
    const resolved = value === next ? null : next;
    setValue(resolved);
    await fetch(`/api/messages/${messageId}/rating`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: resolved }),
    });
  }

  return (
    <div className="flex flex-none gap-1">
      <RatingButton label="Thumbs up" active={value === 1} icon={ThumbsUp} onClick={() => rate(1)} />
      <RatingButton label="Thumbs down" active={value === -1} icon={ThumbsDown} onClick={() => rate(-1)} />
    </div>
  );
}

function RatingButton({
  label,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // A toggle needs a state, not an opacity. Screen readers got neither before.
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded transition-colors",
        // The icon is 16px; the hit area is not.
        "min-h-11 min-w-11 md:min-h-8 md:min-w-8",
        active ? "text-accent" : "text-ink-subtle hover:text-ink",
        FOCUS_RING,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
