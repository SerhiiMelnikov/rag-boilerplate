import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, UnauthorizedError, ForbiddenError, type SessionUser } from "@/lib/auth/guards";

// Server components authorise through the SAME check as every API route, rather
// than branching on a JWT claim. That is the whole point: `auth()` exposes only
// id/role/isSuperAdmin (see applySessionClaims in src/lib/auth/session-callbacks.ts),
// so a page using it cannot see a block, a deletion, a demotion that post-dates
// the token, or the sessions_valid_from cut-off — the cut-off's claim is not even
// copied onto the session object. requireUser reads the row and checks all four.
//
// This module is the only Next-aware auth code in the repo. It lives under
// src/app because src/lib must stay free of `next` for the api-only build, and
// because `src/app` is already in API_ONLY_DELETE_PATHS (cli/src/scaffold.ts) —
// so a generated api-only project drops it with no CLI change.
//
// cache() gives the layout and the page beneath it ONE lookup per render pass.
// Note it only memoises inside a real React render: outside one (a unit test,
// a plain script) React 19 hands back a fresh cache each call, so the dedupe is
// deliberately not asserted in guards.test.ts. Without it the cost is two
// primary-key lookups per navigation, not a correctness problem.
const pageUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const incoming = await headers();
    // Exactly the two headers getSessionFromRequest reads, copied by name
    // rather than by handing the whole ReadonlyHeaders to the Request
    // constructor — the URL is a placeholder, and naming the inputs documents
    // what the guard actually consumes.
    const forwarded: Record<string, string> = {};
    const cookie = incoming.get("cookie");
    if (cookie) forwarded.cookie = cookie;
    const authorization = incoming.get("authorization");
    if (authorization) forwarded.authorization = authorization;
    return await requireUser(new Request("http://page.local/", { headers: forwarded }));
  } catch (err) {
    // Only auth failures mean "not signed in". Anything else — a dead database,
    // a missing AUTH_SECRET — must surface as a 500; swallowing it here would
    // turn an outage into an endless bounce through /login.
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return null;
    throw err;
  }
});

// redirect() signals by throwing NEXT_REDIRECT, so it is never called inside the
// catch above — a surrounding catch would swallow it and render the page anyway.
export async function requirePageUser(): Promise<SessionUser> {
  const user = await pageUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePageAdmin(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function requirePageSuperAdmin(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (!user.isSuperAdmin) redirect("/");
  return user;
}
