import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import type { AuthContextType } from "./hooks/use-auth";
import { isSupabaseConfigured } from "./lib/supabase";

export type AppRouterContext = {
  queryClient: QueryClient;
  auth: AuthContextType;
};

export const queryClient = new QueryClient();

const initialAuth: AuthContextType = {
  user: null,
  profile: null,
  role: null,
  loading: true,
  isDemo: !isSupabaseConfigured,
  isAuthenticated: false,
  signOut: async () => {},
};

export const getRouter = () =>
  createTanStackRouter({
    routeTree,
    context: {
      queryClient,
      auth: initialAuth,
    },
  });

export const router = getRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}