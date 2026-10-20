import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  School,
  Users,
  PhoneCall,
  ClipboardCheck,
  Settings,
  Menu,
  LogOut,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const supabaseClient = supabase as any;

const nav = [
  { to: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/admin/students", label: "Élèves", icon: GraduationCap },
  { to: "/admin/classes", label: "Classes", icon: School },
  { to: "/admin/teachers", label: "Enseignants", icon: Users },
  { to: "/admin/parents", label: "Parents", icon: PhoneCall },
  { to: "/admin/attendance", label: "Présences", icon: ClipboardCheck },
  { to: "/admin/settings", label: "Paramètres", icon: Settings },
] as const;

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [schoolName, setSchoolName] = useState("Établissement");

  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  // Load the current administrator's school name from Supabase.
  useEffect(() => {
    let cancelled = false;

    async function loadSchoolName() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabaseClient.auth.getUser();

        if (userError || !user) {
          return;
        }

        const { data: profile, error: profileError } =
          await supabaseClient
            .from("profiles")
            .select("school_id")
            .eq("id", user.id)
            .single();

        if (profileError || !profile?.school_id) {
          return;
        }

        const { data: school, error: schoolError } =
          await supabaseClient
            .from("schools")
            .select("name")
            .eq("id", profile.school_id)
            .single();

        if (!cancelled && !schoolError && school?.name) {
          setSchoolName(school.name);
        }
      } catch (error) {
        console.error(
          "[EDUSA AdminShell] Unable to load school name:",
          error,
        );
      }
    }

    void loadSchoolName();

    return () => {
      cancelled = true;
    };
  }, []);

  // Update the sidebar immediately when Settings saves a new school name.
  useEffect(() => {
    function handleSchoolUpdated(event: Event) {
      const customEvent = event as CustomEvent<{ name?: string }>;
      const updatedName = customEvent.detail?.name?.trim();

      if (updatedName) {
        setSchoolName(updatedName);
      }
    }

    window.addEventListener(
      "edusa:school-updated",
      handleSchoolUpdated,
    );

    return () => {
      window.removeEventListener(
        "edusa:school-updated",
        handleSchoolUpdated,
      );
    };
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-6">
        <img
          src="/edusa-logo-icon.png"
          alt="EDUSA"
          className="h-9 w-9 rounded-xl object-cover"
        />

        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">
            EDUSA
          </p>

          <p
            className="truncate text-xs text-sidebar-foreground/60"
            title={schoolName}
          >
            {schoolName}
          </p>
        </div>

        <button
          className="ml-auto md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-lg bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/70">
          L'administrateur gère la configuration et le suivi des présences.
        </div>

        <Link
          to="/login"
          className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Se déconnecter
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 md:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
          />

          <div className="absolute inset-y-0 left-0 w-72">
            {sidebar}
          </div>
        </div>
      )}

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-4 py-4 md:px-8">
            <button
              className="rounded-lg border border-border p-2 md:hidden"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold text-foreground">
                {title}
              </h1>

              {subtitle && (
                <p className="truncate text-sm text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>

            {actions && (
              <div className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        </header>

        <main className="px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}