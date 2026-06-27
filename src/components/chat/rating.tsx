"use client";

import { useState } from "react";

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
    <div className="mt-2 flex gap-2">
      <button type="button" aria-label="Thumbs up" onClick={() => rate(1)} className={value === 1 ? "opacity-100" : "opacity-40"}>👍</button>
      <button type="button" aria-label="Thumbs down" onClick={() => rate(-1)} className={value === -1 ? "opacity-100" : "opacity-40"}>👎</button>
    </div>
  );
}
