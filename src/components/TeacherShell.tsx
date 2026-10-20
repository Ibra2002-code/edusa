import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ClipboardCheck, Home, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { school } from "@/lib/mock-data";

export function TeacherShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
  <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
    <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
      <img
        src="/edusa-logo-icon.png"
        alt="EDUSA"
        className="h-9 w-9 rounded-xl object-cover"
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">EDUSA</p>
        <p className="truncate text-xs text-muted-foreground">
          {school.name}
        </p>
      </div>

      <nav className="hidden items-center gap-1 md:flex">
            <Link
              to="/teacher/dashboard"
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium",
                pathname === "/teacher/dashboard"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              Accueil
            </Link>
            <Link
              to="/teacher/classes"
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium",
                pathname.startsWith("/teacher/classes")
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              Mes classes
            </Link>
          </nav>
          <Link
            to="/login"
            aria-label="Se déconnecter"
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-border bg-background md:hidden">
        <Link
          to="/teacher/dashboard"
          className={cn(
            "flex flex-col items-center gap-1 py-3 text-xs font-medium",
            pathname === "/teacher/dashboard" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Home className="h-5 w-5" />
          Accueil
        </Link>
        <Link
          to="/teacher/classes"
          className={cn(
            "flex flex-col items-center gap-1 py-3 text-xs font-medium",
            pathname.startsWith("/teacher/classes") ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ClipboardCheck className="h-5 w-5" />
          Mes classes
        </Link>
      </nav>
    </div>
  );
}
