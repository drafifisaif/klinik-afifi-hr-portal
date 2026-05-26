import { redirect } from "next/navigation";

import { getCurrentSessionProfile } from "@/lib/auth";

export default async function HomePage() {
  const context = await getCurrentSessionProfile();

  if (context.user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
