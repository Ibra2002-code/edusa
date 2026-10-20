import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
GraduationCap,
ShieldCheck,
ArrowRight,
Loader2,
CheckCircle2,
Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Database } from "@/types/database";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
head: () => ({
meta: [
{ title: "EDUSA, présences scolaires" },
{
name: "description",
content:
"Connectez-vous à EDUSA pour gérer les présences de votre école et notifier les parents par WhatsApp.",
},
{ property: "og:title", content: "Connexion — EDUSA" },
{
property: "og:description",
content:
"Plateforme de gestion des présences scolaires et de notification des parents.",
},
],
}),
component: LoginPage,
});

type Role = "admin" | "teacher";

type ProfileRoleRow = Pick<
Database["public"]["Tables"]["profiles"]["Row"],
"role"

> ;

function LoginPage() {
const navigate = useNavigate();

const [role, setRole] = useState<Role>("admin");
const [email, setEmail] = useState("[direction@alhikma.edu](mailto:direction@alhikma.edu)");
const [password, setPassword] = useState("demo1234");
const [loading, setLoading] = useState(false);

const handleLogin = async (e: React.FormEvent) => {
e.preventDefault();


if (loading) return;

setLoading(true);

// ---------------------------------------------------------
// MODE DÉMO
// ---------------------------------------------------------
if (!isSupabaseConfigured) {
  toast.info("Mode Démo : Authentification simulée.");

  setTimeout(() => {
    navigate({
      to: role === "admin" ? "/admin/dashboard" : "/teacher/dashboard",
    });

    setLoading(false);
  }, 800);

  return;
}

// ---------------------------------------------------------
// AUTHENTIFICATION SUPABASE
// ---------------------------------------------------------
try {
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

  // -------------------------------------------------------
  // AUTH FAILED
  // -------------------------------------------------------
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

    setLoading(false);
    return;
  }

  const authenticatedUserId = authData.user.id;

  // -------------------------------------------------------
  // RÉCUPÉRATION DU PROFIL
  // Le rôle en base est la source de vérité.
  // -------------------------------------------------------
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authenticatedUserId)
    .maybeSingle<ProfileRoleRow>();



  // -------------------------------------------------------
  // PROFILE ERROR
  // -------------------------------------------------------
  if (profileError) {
    console.error("[EDUSA AUTH] Profile query failed", profileError);

    toast.error("Impossible de récupérer votre profil. Veuillez réessayer.");

    await supabase.auth.signOut();
    setLoading(false);
    return;
  }

  // -------------------------------------------------------
  // PROFILE DOES NOT EXIST
  // -------------------------------------------------------
  if (!profile) {
    console.error("[EDUSA AUTH] Profile not found", {
      userId: authenticatedUserId,
      email: authData.user.email ?? null,
    });

    toast.error("Profil introuvable. Veuillez contacter l'administrateur.");

    await supabase.auth.signOut();
    setLoading(false);
    return;
  }

  // -------------------------------------------------------
  // VALIDATION DU ROLE
  // -------------------------------------------------------
  if (profile.role !== "admin" && profile.role !== "teacher") {
    console.error("[EDUSA AUTH] Invalid profile role", {
      userId: authenticatedUserId,
      role: profile.role,
    });

    toast.error(
      "Votre compte possède un rôle invalide. Contactez l'administrateur.",
    );

    await supabase.auth.signOut();
    setLoading(false);
    return;
  }

  // -------------------------------------------------------
  // ROLE MISMATCH
  //
  // The selected card is only a UI preference.
  // The database role remains the source of truth.
  // -------------------------------------------------------
  if (profile.role !== role) {
    console.warn("[EDUSA AUTH] Selected role differs from database role", {
      selectedRole: role,
      databaseRole: profile.role,
    });
  }

  toast.success("Connexion réussie");

  // -------------------------------------------------------
  // REDIRECTION SELON LE ROLE RÉEL
  // -------------------------------------------------------
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

return ( <div className="grid min-h-screen lg:grid-cols-2">
{/* SIDEBAR */} <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
{/* subtle dot-grid texture */} <svg
       aria-hidden="true"
       className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
     > <defs> <pattern
           id="edusa-dots"
           x="0"
           y="0"
           width="22"
           height="22"
           patternUnits="userSpaceOnUse"
         > <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" /> </pattern> </defs> <rect width="100%" height="100%" fill="url(#edusa-dots)" /> </svg>


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
        Les présences en classe, les parents informés en quelques
        secondes.
      </h2>

      <p className="text-[15px] leading-relaxed text-sidebar-foreground/70">
        L'administrateur gère la complexité. L'enseignant gère les
        présences.
      </p>

      <ul className="space-y-3 text-sm text-sidebar-foreground/80">
        <li className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-foreground/45" />
          Import des élèves et des numéros des parents
        </li>
        <li className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-foreground/45" />
          Classes et enseignants organisés en un seul endroit
        </li>
        <li className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-foreground/45" />
          Notification WhatsApp automatique en cas d'absence
        </li>
      </ul>
    </div>

    <p className="relative text-xs text-sidebar-foreground/50">
      © 2026 EDUSA — Plateforme de présence scolaire
    </p>
  </div>

  {/* FORMULAIRE */}
  <div className="flex items-center justify-center bg-background px-4 py-12">
    <div className="w-full max-w-sm">
      <div className="mb-8 lg:hidden">
        <img
          src="/edusa-logo-icon.png"
          alt="EDUSA"
          className="h-10 w-10 rounded-xl object-cover"
        />
      </div>

      <h1 className="font-serif text-3xl font-medium tracking-tight">
        Bienvenue sur EDUSA
      </h1>

      <p className="mt-2 text-sm text-muted-foreground">
        Sélectionnez votre profil pour continuer.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <RoleCard
          active={role === "admin"}
          onClick={() => {
            setRole("admin");
            setEmail("direction@alhikma.edu");
          }}
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Administrateur"
          desc="Gestion de l'école"
        />

        <RoleCard
          active={role === "teacher"}
          onClick={() => {
            setRole("teacher");
            setEmail("amina.abdirahman@alhikma.edu");
          }}
          icon={<GraduationCap className="h-5 w-5" />}
          title="Enseignant"
          desc="Prise de présence"
        />
      </div>

      <form className="mt-7 space-y-4" onSubmit={handleLogin}>
        <div className="space-y-2">
          <Label htmlFor="email">Adresse e-mail</Label>

          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
          : "Démonstration — aucune authentification réelle n'est activée."}
      </p>
    </div>
  </div>
</div>


);
}

function RoleCard({
active,
onClick,
icon,
title,
desc,
}: {
active: boolean;
onClick: () => void;
icon: React.ReactNode;
title: string;
desc: string;
}) {
return (
<button
type="button"
onClick={onClick}
aria-pressed={active}
className={cn(
"relative rounded-xl border p-4 text-left transition-all duration-150",
active
? "border-primary/60 bg-accent/60 text-accent-foreground ring-1 ring-primary/25"
: "border-border bg-card hover:border-border hover:bg-secondary/60",
)}
>
{active && ( <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />
)}


  <span className="text-primary">{icon}</span>

  <p className="mt-2 text-sm font-semibold">{title}</p>

  <p className="text-xs text-muted-foreground">{desc}</p>
</button>

);
}
