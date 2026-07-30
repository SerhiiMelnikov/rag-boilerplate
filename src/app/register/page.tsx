import { AuthForm } from "@/components/auth-form";
import { configuredOAuthProviderIds } from "@/lib/auth/oauth/providers";

export default function RegisterPage() {
  return <AuthForm mode="register" providers={configuredOAuthProviderIds()} />;
}
