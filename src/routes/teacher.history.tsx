import { createFileRoute } from "@tanstack/react-router";
import { TeacherShell } from "@/components/TeacherShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useEdusa } from "@/lib/edusa-store";
import { formatDateFr } from "@/lib/mock-data";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/teacher/history")({
  beforeLoad: ({ context }) => requireRole(context, "teacher"),
  head: () => ({
    meta: [
      { title: "Historique de mes appels — EDUSA" },
      {
        name: "description",
        content: "Retrouvez les appels que vous avez effectués pour vos classes assignées.",
      },
      { property: "og:title", content: "Historique de mes appels — EDUSA" },
      {
        property: "og:description",
        content: "Présents, absents et parents notifiés pour chacune de vos classes.",
      },
    ],
  }),
  component: TeacherHistory,
});

function TeacherHistory() {
  const { currentTeacher, classes, sessions } = useEdusa();
  const mine = sessions
    .filter((s) => currentTeacher.classIds.includes(s.classId))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : -1));

  return (
    <TeacherShell>
      <h1 className="text-xl font-semibold">Historique des présences</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Uniquement les appels de vos classes assignées.
      </p>

      <div className="mt-5 space-y-3">
        {mine.map((s) => (
          <Card key={s.id} className="shadow-[var(--shadow-card)]">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {classes.find((c) => c.id === s.classId)?.name ?? s.classId}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateFr(s.date)} · {s.time}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{s.presentIds.length} présents</Badge>
                <Badge variant={s.absentIds.length > 0 ? "destructive" : "outline"}>
                  {s.absentIds.length} absents
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {mine.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Aucun appel enregistré pour le moment.
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherShell>
  );
}
