import { registry } from "./registry";

// Auth.js v5 stores a JWT session in a cookie (authjs.session-token; __Secure- prefixed in
// production). Documented as a cookie apiKey scheme; guarded paths reference `sessionCookie`.
export const sessionCookie = registry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "authjs.session-token",
});
