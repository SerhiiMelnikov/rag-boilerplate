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

// The authenticated "change my password" body. Unlike setPasswordSchema this is
// a genuinely different shape: there is no token, and the caller must re-prove
// the password they already have.
export const newPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
