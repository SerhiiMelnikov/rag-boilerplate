import { z } from "zod";

// Registration takes an email only — the password is chosen later, by whoever
// clicks the verification link, never carried in the request that sends it. See
// the design doc: "Why the password cannot travel with the registration".
export const registerSchema = z.object({
  email: z.string().email(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// The "choose your password" form submitted from the verification link.
export const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
