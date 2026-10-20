import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Users, CheckCircle2 } from "lucide-react";
import { TeacherShell } from "@/components/TeacherShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { requireRole } from "@/lib/auth-route";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";

const todayISO = () => new Date().toISOString().slice(0, 10);
const formatToday = () =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
const formatDateFr = (isoDate: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));

export const Route = createFileRoute("/teacher/dashboard")({
  beforeLoad: ({ context }) => {
    requireRole(context, "teacher");
  },
  head: () => ({
    meta: [
      { title: "Espace enseignant — EDUSA" },
      {
        name: "description",
        content: "Retrouvez vos classes du jour et faites l'appel en quelques secondes.",
      },
      { property: "og:title", content: "Espace enseignant — EDUSA" },
      {
        property: "og:description",
        content: "Prise de présence rapide, pensée pour le mobile et la tablette.",
      },
    ],
  }),
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const { profile } = useAuth();
  const { classes: myClasses } = useTeacherClasses();
  const today = todayISO();
  const doneToday = myClasses.filter((c) => c.lastSession?.date === today).length;
  const teacherName = profile?.full_name ?? "enseignant";

  return (
    <TeacherShell>
      {/* Carte de bienvenue originale Lovable */}
      <div className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground">
        <p className="text-sm text-sidebar-foreground/70 capitalize">{formatToday()}</p>
        <h1 className="mt-1 text-2xl font-semibold">Bonjour {teacherName}</h1>
        <p className="mt-2 text-sm text-sidebar-foreground/70">
          {doneToday}/{myClasses.length} appel(s) effectué(s) aujourd'hui.
        </p>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Mes classes</h2>
      <div className="mt-3 space-y-3">
        {myClasses.map((c) => {
          const done = c.lastSession?.date === today;
          
          return (
            <Card key={c.id} className="shadow-[var(--shadow-card)]">
              <CardContent className="flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold">{c.name}</p>
                    {done && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" /> Appel fait
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {c.studentCount} élèves · {c.level}
                  </p>
                  {c.lastSession && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Dernier appel : {formatDateFr(c.lastSession.date)} ·{" "}
                      {c.lastSession.absentIds.length} absent(s)
                    </p>
                  )}
                </div>
                <Button asChild size="lg" className="min-h-12 w-full sm:w-auto">
                  <Link to="/teacher/classes/$classId/attendance" params={{ classId: c.id }}>
                    {done ? "Refaire l'appel" : "Faire l'appel"}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        
        {myClasses.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Aucune classe ne vous est assignée. Contactez l'administrateur.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lien d'historique original Lovable */}
      <Link
        to="/teacher/history"
        className="mt-4 block rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-secondary"
      >
        Voir l'historique de mes appels
      </Link>
    </TeacherShell>
  );
}