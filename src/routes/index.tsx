import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // Si l'utilisateur n'est pas connecté, on l'envoie vers /login
    // Si vous voulez une redirection intelligente plus tard (ex: vers dashboard), 
    // on le fera ici. Pour l'instant, priorité au Login.
    throw redirect({
      to: "/login",
    });
  },
  // On ne met pas de composant car on ne s'arrête jamais sur cette route
  component: () => null,
});