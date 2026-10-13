import "server-only";

import { cache } from "react";

import { canAccessRoute } from "@/lib/navigation";
import { getCurrentUserContext } from "@/lib/workflows";
import type { AppRouteKey } from "@/lib/types";

// React scopes this cache to one server render, never across users/requests.
// Mutation workflows continue to call the uncached context reader directly.
export const getCurrentSessionProfile = cache(getCurrentUserContext);

export async function requireRouteAccess(routeKey: AppRouteKey) {
  const context = await getCurrentSessionProfile();

  if (!context.user) {
    return { ...context, unauthorized: true as const };
  }

  if (routeKey === "notifications") {
    return {
      ...context,
      unauthorized: false as const,
    };
  }

  return {
    ...context,
    unauthorized: !canAccessRoute(context.role, routeKey),
  };
}
