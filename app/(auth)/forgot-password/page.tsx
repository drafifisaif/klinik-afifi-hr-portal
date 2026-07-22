import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getCurrentSessionProfile } from "@/lib/auth";

export default async function ForgotPasswordPage() {
  const context = await getCurrentSessionProfile();

  if (context.user) {
    redirect("/dashboard");
  }

  return <ForgotPasswordForm />;
}
