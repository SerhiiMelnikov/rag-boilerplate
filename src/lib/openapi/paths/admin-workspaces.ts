import { registry } from "../registry";
import { z } from "../zod";
import { ErrorResponse } from "../schemas";

// Mirrors WorkspaceRow (src/lib/workspaces/admin.ts: listWorkspaces()) — the admin
// listing carries `description` and `createdAt` on top of the shared Workspace
// schema's {id, name, isDefault}, so it is documented inline rather than reusing it.
const AdminWorkspaceRow = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
});

// Mirrors WorkspaceUserRow (src/lib/workspaces/admin.ts: listWorkspaceUsers()).
const WorkspaceUserRow = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  granted: z.boolean(),
});

// GET /api/admin/workspaces (.../route.ts + handler.ts: listWorkspacesResponse()).
registry.registerPath({
  method: "get",
  path: "/api/admin/workspaces",
  tags: ["Admin: Workspaces"],
  summary: "List all workspaces",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "All workspaces, General first then alphabetical",
      content: { "application/json": { schema: z.object({ workspaces: z.array(AdminWorkspaceRow) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// POST /api/admin/workspaces (.../handler.ts: createWorkspaceResponse()).
registry.registerPath({
  method: "post",
  path: "/api/admin/workspaces",
  tags: ["Admin: Workspaces"],
  summary: "Create a workspace",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ name: z.string().min(1).max(64), description: z.string().max(280).optional() }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "The new workspace's id",
      content: { "application/json": { schema: z.object({ id: z.string().uuid() }) } },
    },
    400: { description: "Invalid JSON or missing/invalid name", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    409: { description: "A workspace with that name already exists", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// PATCH /api/admin/workspaces/{id} (.../[id]/handler.ts: patchWorkspaceResponse()): name
// and/or description; at least one is required. The General workspace cannot be renamed
// (description may still change).
registry.registerPath({
  method: "patch",
  path: "/api/admin/workspaces/{id}",
  tags: ["Admin: Workspaces"],
  summary: "Rename or redescribe a workspace",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().min(1).max(64).optional(),
            description: z.string().max(280).nullable().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    400: { description: "Invalid JSON, or neither name nor description given", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin, or renaming the General workspace", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Workspace not found", content: { "application/json": { schema: ErrorResponse } } },
    409: { description: "A workspace with that name already exists", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// DELETE /api/admin/workspaces/{id} (.../[id]/handler.ts: deleteWorkspaceResponse()): the
// General workspace cannot be deleted; its content stays reachable via General.
registry.registerPath({
  method: "delete",
  path: "/api/admin/workspaces/{id}",
  tags: ["Admin: Workspaces"],
  summary: "Delete a workspace",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin, or deleting the General workspace", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Workspace not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// GET /api/admin/workspaces/{id}/users (.../[id]/users/handler.ts:
// listWorkspaceUsersResponse()) — corrected against the handler: the brief's table
// listed `200 {userIds:[...]}`; the real response is `{ users: [{id,email,granted}] }`,
// every user flagged with whether this workspace is granted to them (General's access
// is implicit, so all rows come back granted there).
registry.registerPath({
  method: "get",
  path: "/api/admin/workspaces/{id}/users",
  tags: ["Admin: Workspaces"],
  summary: "List every user with their access flag for a workspace",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Every user, with `granted` for this workspace",
      content: { "application/json": { schema: z.object({ users: z.array(WorkspaceUserRow) }) } },
    },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Workspace not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

// PUT /api/admin/workspaces/{id}/users (.../[id]/users/handler.ts:
// setWorkspaceGrantResponse()) — corrected against the handler: the brief's table listed
// a bulk `body {userIds}` replacing the full list; the real body is
// `{userId, granted}`, toggling ONE user's grant at a time. Granting/revoking on the
// General workspace is rejected (everyone already has implicit access there).
registry.registerPath({
  method: "put",
  path: "/api/admin/workspaces/{id}/users",
  tags: ["Admin: Workspaces"],
  summary: "Grant or revoke one user's access to a workspace",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({ userId: z.string().uuid(), granted: z.boolean() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Grant updated",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    400: { description: "Invalid JSON or malformed body", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Signed in but not an admin, or changing grants on the General workspace", content: { "application/json": { schema: ErrorResponse } } },
    404: { description: "Workspace not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});
