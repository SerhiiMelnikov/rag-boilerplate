// The AI SDK reports a non-2xx response by throwing an Error whose message is the
// raw response body. Our API returns JSON, so unwrap it back into a sentence a
// person can read — and fall back gracefully when the body is not ours (a proxy
// error page, a dropped connection).
export function humanizeChatError(error: Error): string {
  const raw = error.message;
  if (!raw) return "Something went wrong. Please try again.";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const message = (parsed as { error: unknown }).error;
      if (typeof message === "string" && message.length > 0) return message;
    }
  } catch {
    // Not JSON — use the raw text.
  }
  return raw;
}
