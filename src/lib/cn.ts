// Join class strings, dropping anything falsy. Ten lines instead of a dependency:
// the primitives need conditional classes, not a full variant engine.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
