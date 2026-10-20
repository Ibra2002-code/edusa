import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/teacher/")({
  beforeLoad: ({ context }) => {
    requireRole(context, "teacher");
    // Redirection automatique vers le tableau de bord pour éviter une page blanche
    throw redirect({ to: "/teacher/dashboard" });
  },
  // Le composant peut être null car la redirection intervient avant le rendu
  component: () => null,
});