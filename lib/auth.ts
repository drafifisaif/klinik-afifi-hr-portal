import "server-only";

import { canAccessRoute } from "@/lib/navigation";
import { getCurrentUserContext } from "@/lib/workflows";
import type { AppRouteKey } from "@/lib/types";

export async function getCurrentSessionProfile() {
  return getCurrentUserContext();
}

export async function requireRouteAccess(routeKey: AppRouteKey) {
  const context = await getCurrentUserContext();

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
