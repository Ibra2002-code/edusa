import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { router, queryClient } from "./router";

function AppWithAuth() {
  const auth = useAuth();

  useEffect(() => {
    void router.invalidate();
  }, [auth]);

  return (
    <RouterProvider 
      router={router} 
      context={{ 
        auth, 
        queryClient 
      }} 
    />
  );
}

export default function App() {
  return <AppWithAuth />;
}