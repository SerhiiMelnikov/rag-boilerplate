import { z } from "zod";

// Email + password rules shared by register and (client) login.
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type Credentials = z.infer<typeof credentialsSchema>;
