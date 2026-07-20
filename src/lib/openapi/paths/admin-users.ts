import { registry } from "../registry";
import { z } from "../zod";
import { User, ErrorResponse } from "../schemas";

// GET /api/admin/users (src/app/api/admin/users/route.ts): listUsers() — corrected
// against the handler: guarded by requireSuperAdmin(), not requireAdmin() (a plain
// admin gets 403 here too). Still documented with the shared sessionCookie scheme;
// the summary calls out the stricter requirement.
registry.registerPath({
  method: "get",
  path: "/api/admin/users",
  tags: ["Admin: Users"],
  summary: "List all users (super-admin only)",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "All users",
      content: { "application/json": { schema: z.object({ users: z.array(User) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not a super-admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// PATCH /api/admin/users/{id} (.../[id]/route.ts) — corrected against the handler on two
// points: (1) it is guarded by requireSuperAdmin(), not requireAdmin(); (2) the body is
// NOT `{role?, blocked?}` (both optional together) as the brief's table listed — it is a
// strict union of exactly one of `{role}` XOR `{blocked}`. 403 also covers the service's
// own guards (setUserRole/setUserBlocked): acting on the super-admin account, or on the
// caller's own account, both throw and map to 403 alongside the plain "not a super-admin" case.
registry.registerPath({
  method: "patch",
  path: "/api/admin/users/{id}",
  tags: ["Admin: Users"],
  summary: "Change a user's role or blocked status (super-admin only)",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.union([
            z.object({ role: z.enum(["admin", "user"]) }),
            z.object({ blocked: z.boolean() }),
          ]),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    400: { description: "Invalid JSON or neither role nor blocked given", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: {
      description: "Not a super-admin, or targeting the super-admin account or the caller's own account",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: { description: "User not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
