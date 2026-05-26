import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentSessionProfile } from "@/lib/auth";

export default async function LoginPage() {
  const context = await getCurrentSessionProfile();

  if (context.user) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
