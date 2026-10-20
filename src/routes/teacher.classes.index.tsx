import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Users } from "lucide-react";
import { TeacherShell } from "@/components/TeacherShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth-route";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";

export const Route = createFileRoute("/teacher/classes/")({
  beforeLoad: ({ context }) => requireRole(context, "teacher"),
  head: () => ({
    meta: [
      { title: "Mes classes — EDUSA" },
      {
        name: "description",
        content: "Liste des classes qui vous sont assignées pour la prise de présence.",
      },
      { property: "og:title", content: "Mes classes — EDUSA" },
      {
        property: "og:description",
        content: "Sélectionnez une classe pour marquer les élèves absents.",
      },
    ],
  }),
  component: TeacherClasses,
});

function TeacherClasses() {
  const { classes: myClasses } = useTeacherClasses();

  return (
    <TeacherShell>
      <h1 className="text-xl font-semibold">Mes classes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Seules les classes qui vous sont assignées apparaissent ici.
      </p>
      <div className="mt-5 space-y-3">
        {myClasses.map((c) => (
          <Card key={c.id} className="shadow-[var(--shadow-card)]">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{c.name}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {c.studentCount} élèves
                </p>
              </div>
              <Button asChild>
                <Link to="/teacher/classes/$classId/attendance" params={{ classId: c.id }}>
                  Faire l'appel
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </TeacherShell>
  );
}
