// The browser's view of a persisted message. Mirrors MessageRecord in
// src/lib/chat/conversations.ts — including sourceCount, which is the only
// provenance that crosses the wire.
export interface ImageRef {
  imageId: string;
  caption: string;
}

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images: ImageRef[];
  rating: number | null;
  sourceCount: number;
}
