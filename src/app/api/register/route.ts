import { credentialsSchema } from "@/lib/validation";
import { createUser, DuplicateEmailError } from "@/lib/auth/users";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    // Self-registration always creates a regular user; admins are seeded.
    const user = await createUser({ email: parsed.data.email, password: parsed.data.password, role: "user" });
    return Response.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return Response.json({ error: "Email already registered" }, { status: 409 });
    }
    throw err;
  }
}
