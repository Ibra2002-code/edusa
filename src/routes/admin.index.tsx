import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/")({
  beforeLoad: ({ context }) => {
    requireRole(context, "admin");
    throw redirect({ to: "/admin/dashboard" });
  },
  component: () => null,
});
