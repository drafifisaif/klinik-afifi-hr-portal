"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    setIsPending(true);

    try {
      await supabase?.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-3 sm:px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden md:inline">{isPending ? "Signing out" : "Logout"}</span>
    </button>
  );
}
