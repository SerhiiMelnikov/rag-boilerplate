// Shared "run this in the background" primitive for the standalone Hono server.
// Same shape as the in-process default each handler already falls back to when
// no `schedule` dep is injected (see e.g. src/api/admin/documents/handler.ts) —
// defined once here so every route registration can pass the identical function
// instead of each handler re-implementing its own default.
//
// Parameter typed as `() => unknown` (not the narrower `() => void | Promise<void>`)
// because the 5 handlers with an injectable `schedule` dep declare two slightly
// different (structurally compatible) shapes for it: 4 of them (documents/images
// upload, image caption patch, image recaption) type it as `() => Promise<unknown>`,
// while the evaluation-runs handler types it as `() => void | Promise<void>`. `unknown`
// is a supertype of both, so this one implementation is assignable to every one of
// those dependency types without editing the (next-free, untouched) handler files.
export const schedule = (fn: () => unknown): void => {
  void Promise.resolve()
    .then(fn)
    .catch((e) => console.error("background job failed", e));
};
