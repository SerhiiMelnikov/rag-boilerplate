import { AuthForm } from "@/components/auth-form";
import { configuredOAuthProviderIds } from "@/lib/auth/oauth/providers";

// Never prerender: configuredOAuthProviderIds() reads GOOGLE_CLIENT_ID and
// friends from process.env, and this component is synchronous and touches no
// dynamic API, so Next would evaluate it at BUILD time and bake the answer into
// static HTML. The Dockerfile runs `npm run build` with only DATABASE_URL set, so
// that answer is always "no providers" and no runtime environment can change it —
// the buttons would simply never appear in a real deployment. /login escapes this
// only incidentally, by awaiting searchParams; here it has to be explicit.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <AuthForm mode="register" providers={configuredOAuthProviderIds()} />;
}
