import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Lock,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Database } from "@/types/database";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "EDUSA — Régularité scolaire" },
      {
        name: "description",
        content:
          "EDUSA rapproche les écoles, les élèves et les parents pour favoriser une présence régulière en classe et un meilleur suivi scolaire.",
      },
      { property: "og:title", content: "Connexion — EDUSA" },
      {
        property: "og:description",
        content:
          "Suivre la présence des élèves et renforcer le lien entre l'école et les familles.",
      },
    ],
  }),
  component: LoginPage,
});

type ProfileRoleRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "role"
>;

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

    if (!isSupabaseConfigured) {
      toast.error(
        "Authentification indisponible : configuration Supabase manquante. Contactez l'administrateur.",
      );
      setLoading(false);
      return;
    }

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError || !authData.user) {
        console.error("[EDUSA AUTH] Login failed", {
          code: authError?.code ?? null,
          message: authError?.message ?? null,
          status: authError?.status ?? null,
        });

        toast.error(
          "Échec de la connexion : " +
            (authError?.message || "Identifiants invalides"),
        );
        return;
      }

      const authenticatedUserId = authData.user.id;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authenticatedUserId)
        .maybeSingle<ProfileRoleRow>();

      if (profileError) {
        console.error("[EDUSA AUTH] Profile query failed", profileError);
        toast.error(
          "Impossible de récupérer votre profil. Veuillez réessayer.",
        );
        await supabase.auth.signOut();
        return;
      }

      if (!profile) {
        console.error("[EDUSA AUTH] Profile not found", {
          userId: authenticatedUserId,
          email: authData.user.email ?? null,
        });

        toast.error(
          "Profil introuvable. Veuillez contacter l'administrateur.",
        );
        await supabase.auth.signOut();
        return;
      }

      if (profile.role !== "admin" && profile.role !== "teacher") {
        console.error("[EDUSA AUTH] Invalid profile role", {
          userId: authenticatedUserId,
          role: profile.role,
        });

        toast.error(
          "Votre compte possède un rôle invalide. Contactez l'administrateur.",
        );
        await supabase.auth.signOut();
        return;
      }

      toast.success("Connexion réussie");

      if (profile.role === "admin") {
        await navigate({ to: "/admin/dashboard" });
      } else {
        await navigate({ to: "/teacher/dashboard" });
      }
    } catch (err) {
      console.error("[EDUSA AUTH] Unexpected login error", err);
      toast.error("Une erreur inattendue est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* LEFT PANEL */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
        >
          <defs>
            <pattern
              id="edusa-dots"
              x="0"
              y="0"
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#edusa-dots)" />
        </svg>

        <div className="relative flex items-center gap-3">
          <img
            src="/edusa-logo-icon.png"
            alt="EDUSA"
            className="h-10 w-10 rounded-xl object-cover"
          />
          <span className="text-lg font-semibold tracking-tight">EDUSA</span>
        </div>

        <div className="relative max-w-md space-y-6">
          <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-tight">
            Ensemble, favorisons la régularité scolaire.
          </h2>

          <p className="text-[15px] leading-relaxed text-sidebar-foreground/70">
            EDUSA rapproche les écoles, les élèves et les parents pour
            favoriser une présence régulière en classe et un meilleur suivi
            scolaire.
          </p>

          <ul className="space-y-5 text-sm text-sidebar-foreground/80">
            <li className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-sidebar-foreground/70" />
              <div>
                <p className="font-medium text-sidebar-foreground">
                  Suivre la présence des élèves
                </p>
                <p className="mt-1 leading-relaxed text-sidebar-foreground/70">
                  Une meilleure visibilité sur les présences et les absences.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-sidebar-foreground/70" />
              <div>
                <p className="font-medium text-sidebar-foreground">
                  Renforcer le lien avec les parents
                </p>
                <p className="mt-1 leading-relaxed text-sidebar-foreground/70">
                  Une communication plus simple entre l'école et les familles.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-sidebar-foreground/70" />
              <div>
                <p className="font-medium text-sidebar-foreground">
                  Encourager la régularité scolaire
                </p>
                <p className="mt-1 leading-relaxed text-sidebar-foreground/70">
                  Un suivi partagé pour aider chaque élève à rester engagé.
                </p>
              </div>
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          © 2026 EDUSA — Plateforme de gestion scolaire
        </p>
      </div>

      {/* LOGIN FORM */}
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <img
                src="/edusa-logo-icon.png"
                alt="EDUSA"
                className="h-10 w-10 rounded-xl object-cover"
              />
              <span className="text-lg font-semibold tracking-tight">
                EDUSA
              </span>
            </div>
          </div>

          <h1 className="font-serif text-3xl font-medium tracking-tight">
            Bienvenue sur EDUSA
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous à votre espace administrateur.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="votre@email.com"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="group mt-2 w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}

              Se connecter

              {!loading && (
                <ArrowRight className="ml-1 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              )}
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            {isSupabaseConfigured
              ? "Authentification sécurisée active"
              : "Configuration Supabase manquante."}
          </p>

          <p className="mt-8 text-center text-xs text-muted-foreground lg:hidden">
            © 2026 EDUSA — Plateforme de gestion scolaire
          </p>
        </div>
      </div>
    </div>
  );
}
