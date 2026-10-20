import { redirect } from "@tanstack/react-router";
import type { AuthContextType } from "@/hooks/use-auth";

export function requireRole(context: { auth?: AuthContextType }, role: "admin" | "teacher") {
  const auth = context.auth;

  if (auth?.loading) return;

  if (auth?.role !== role) {
    throw redirect({ to: "/login" });
  }
}