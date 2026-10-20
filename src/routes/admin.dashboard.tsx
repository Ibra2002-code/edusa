import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GraduationCap,
  PhoneCall,
  School,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: ({ context }) => {
    requireRole(context, "admin");
  },

  head: () => ({
    meta: [
      {
        title: "Tableau de bord administrateur — EDUSA",
      },
      {
        name: "description",
        content:
          "Vue d'ensemble de l'école : élèves, enseignants, classes et présences du jour sur EDUSA.",
      },
      {
        property: "og:title",
        content: "Tableau de bord administrateur — EDUSA",
      },
      {
        property: "og:description",
        content:
          "Suivez les présences et absences quotidiennes de votre établissement.",
      },
    ],
  }),

  component: AdminDashboard,
});

type DashboardStats = {
  schoolName: string;
  schoolCity: string | null;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  parentCount: number;
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
  checkedClasses: number;
};

type AtRiskStudent = {
  id: string;
  name: string;
  className: string;
  count: number;
};

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  time: string;
  tone: "absence" | "success" | "info";
};

type SchoolRow = {
  id: string;
  name: string;
  city: string | null;
  timezone: string | null;
};

type ProfileRow = {
  school_id: string | null;
};

type ClassRow = {
  id: string;
  name: string;
};

type StudentRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  class_id: string;
};

type TeacherRow = {
  id: string;
  profile_id: string;
  active: boolean;
};

type AttendanceSessionRow = {
  id: string;
  class_id: string;
  date: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
};

type AttendanceRecordRow = {
  id: string;
  session_id: string;
  student_id: string;
  status: "present" | "absent";
  marked_at: string;
};

function AdminDashboard() {
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<DashboardStats>({
    schoolName: "EDUSA",
    schoolCity: null,
    studentCount: 0,
    teacherCount: 0,
    classCount: 0,
    parentCount: 0,
    presentToday: 0,
    absentToday: 0,
    attendanceRate: 0,
    checkedClasses: 0,
  });

  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      /*
       * ------------------------------------------------------------
       * 1. ADMIN PROFILE / SCHOOL
       * ------------------------------------------------------------
       */

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      const profileRow = profile as ProfileRow;

      if (!profileRow.school_id) {
        throw new Error("Aucune école associée à votre compte.");
      }

      const schoolId = profileRow.school_id;

      /*
       * ------------------------------------------------------------
       * 2. SCHOOL INFORMATION
       * ------------------------------------------------------------
       */

      const { data: schoolData, error: schoolError } = await supabase
        .from("schools")
        .select("id, name, city, timezone")
        .eq("id", schoolId)
        .single();

      if (schoolError) {
        throw schoolError;
      }

      const school = schoolData as SchoolRow;

      /*
       * ------------------------------------------------------------
       * 3. BASIC COUNTS
       * ------------------------------------------------------------
       */

      const [
        studentsResult,
        teachersResult,
        classesResult,
        parentsResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("active", true),

        supabase
          .from("teachers")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("active", true),

        supabase
          .from("classes")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("active", true),

        supabase
          .from("parents")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("active", true),
      ]);

      if (studentsResult.error) {
        throw studentsResult.error;
      }

      if (teachersResult.error) {
        throw teachersResult.error;
      }

      if (classesResult.error) {
        throw classesResult.error;
      }

      if (parentsResult.error) {
        throw parentsResult.error;
      }

      /*
       * ------------------------------------------------------------
       * 4. TODAY'S ATTENDANCE
       * ------------------------------------------------------------
       */

      const today = getTodayISO(school.timezone);

      const { data: todaySessionsData, error: todaySessionsError } =
        await supabase
          .from("attendance_sessions")
          .select(
            "id, class_id, date, status, submitted_at, created_at",
          )
          .eq("school_id", schoolId)
          .eq("date", today)
          .eq("status", "submitted")
          .order("created_at", { ascending: false });

      if (todaySessionsError) {
        throw todaySessionsError;
      }

      const todaySessions =
        (todaySessionsData ?? []) as AttendanceSessionRow[];

      let presentToday = 0;
      let absentToday = 0;

      if (todaySessions.length > 0) {
        const sessionIds = todaySessions.map(
          (session) => session.id,
        );

        const { data: todayRecordsData, error: todayRecordsError } =
          await supabase
            .from("attendance_records")
            .select(
              "id, session_id, student_id, status, marked_at",
            )
            .in("session_id", sessionIds);

        if (todayRecordsError) {
          throw todayRecordsError;
        }

        const todayRecords =
          (todayRecordsData ?? []) as AttendanceRecordRow[];

        presentToday = todayRecords.filter(
          (record) => record.status === "present",
        ).length;

        absentToday = todayRecords.filter(
          (record) => record.status === "absent",
        ).length;
      }

      const totalMarked = presentToday + absentToday;

      const attendanceRate =
        totalMarked > 0
          ? Math.round((presentToday / totalMarked) * 100)
          : 0;

      /*
       * ------------------------------------------------------------
       * 5. REPEATED ABSENCES THIS MONTH
       * ------------------------------------------------------------
       */

      const monthStart = getMonthStartISO(
        school.timezone,
      );

      const { data: monthSessionsData, error: monthSessionsError } =
        await supabase
          .from("attendance_sessions")
          .select(
            "id, class_id, date, status, submitted_at, created_at",
          )
          .eq("school_id", schoolId)
          .gte("date", monthStart)
          .eq("status", "submitted")
          .order("date", { ascending: false });

      if (monthSessionsError) {
        throw monthSessionsError;
      }

      const monthSessions =
        (monthSessionsData ?? []) as AttendanceSessionRow[];

      let atRiskStudents: AtRiskStudent[] = [];

      if (monthSessions.length > 0) {
        const sessionIds = monthSessions.map(
          (session) => session.id,
        );

        const { data: absentRecordsData, error: absentRecordsError } =
          await supabase
            .from("attendance_records")
            .select(
              "id, session_id, student_id, status, marked_at",
            )
            .in("session_id", sessionIds)
            .eq("status", "absent");

        if (absentRecordsError) {
          throw absentRecordsError;
        }

        const absentRecords =
          (absentRecordsData ?? []) as AttendanceRecordRow[];

        const absenceCounts = new Map<string, number>();

        for (const record of absentRecords) {
          absenceCounts.set(
            record.student_id,
            (absenceCounts.get(record.student_id) ?? 0) + 1,
          );
        }

        const studentsWithRepeatedAbsences = Array.from(
          absenceCounts.entries(),
        )
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (studentsWithRepeatedAbsences.length > 0) {
          const studentIds =
            studentsWithRepeatedAbsences.map(
              ([studentId]) => studentId,
            );

          const { data: studentsData, error: studentsError } =
            await supabase
              .from("students")
              .select(
                "id, first_name, middle_name, last_name, class_id",
              )
              .in("id", studentIds)
              .eq("school_id", schoolId);

          if (studentsError) {
            throw studentsError;
          }

          const { data: classesData, error: classesError } =
            await supabase
              .from("classes")
              .select("id, name")
              .eq("school_id", schoolId);

          if (classesError) {
            throw classesError;
          }

          const students =
            (studentsData ?? []) as StudentRow[];

          const classes =
            (classesData ?? []) as ClassRow[];

          const classMap = new Map<string, string>();

          for (const schoolClass of classes) {
            classMap.set(
              schoolClass.id,
              schoolClass.name,
            );
          }

          const studentMap = new Map<
            string,
            StudentRow
          >();

          for (const student of students) {
            studentMap.set(student.id, student);
          }

          atRiskStudents =
            studentsWithRepeatedAbsences
              .map(([studentId, count]) => {
                const student =
                  studentMap.get(studentId);

                if (!student) {
                  return null;
                }

                const fullName = [
                  student.first_name,
                  student.middle_name,
                  student.last_name,
                ]
                  .filter(Boolean)
                  .join(" ");

                return {
                  id: student.id,
                  name: fullName,
                  className:
                    classMap.get(student.class_id) ?? "—",
                  count,
                };
              })
              .filter(
                (item): item is AtRiskStudent =>
                  item !== null,
              );
        }
      }

      /*
       * ------------------------------------------------------------
       * 6. RECENT ACTIVITY
       * ------------------------------------------------------------
       */

      const { data: recentSessionsData, error: recentSessionsError } =
        await supabase
          .from("attendance_sessions")
          .select(
            "id, class_id, date, status, submitted_at, created_at",
          )
          .eq("school_id", schoolId)
          .eq("status", "submitted")
          .order("created_at", { ascending: false })
          .limit(5);

      if (recentSessionsError) {
        throw recentSessionsError;
      }

      const recentSessions =
        (recentSessionsData ?? []) as AttendanceSessionRow[];

      const { data: recentClassesData, error: recentClassesError } =
        await supabase
          .from("classes")
          .select("id, name")
          .eq("school_id", schoolId);

      if (recentClassesError) {
        throw recentClassesError;
      }

      const recentClasses =
        (recentClassesData ?? []) as ClassRow[];

      const recentClassMap = new Map<string, string>();

      for (const schoolClass of recentClasses) {
        recentClassMap.set(
          schoolClass.id,
          schoolClass.name,
        );
      }

      const recentActivity: ActivityItem[] =
        recentSessions.map((session) => ({
          id: session.id,
          label: "Appel enregistré",
          detail: `Présences enregistrées pour ${
            recentClassMap.get(session.class_id) ?? "classe inconnue"
          }`,
          time: formatActivityTime(
            session.submitted_at ?? session.created_at,
            school.timezone,
          ),
          tone: "success",
        }));

      /*
       * ------------------------------------------------------------
       * 7. SET STATE
       * ------------------------------------------------------------
       */

      setStats({
        schoolName: school.name,
        schoolCity: school.city,
        studentCount: studentsResult.count ?? 0,
        teacherCount: teachersResult.count ?? 0,
        classCount: classesResult.count ?? 0,
        parentCount: parentsResult.count ?? 0,
        presentToday,
        absentToday,
        attendanceRate,
        checkedClasses: todaySessions.length,
      });

      setAtRisk(atRiskStudents);
      setActivity(recentActivity);
    } catch (error) {
      console.error(
        "[EDUSA Admin Dashboard]",
        error,
      );
    } finally {
      setLoading(false);
    }
  }

  const schoolSubtitle = stats.schoolCity
    ? `${stats.schoolCity} · ${formatToday()}`
    : formatToday();

  return (
    <AdminShell
      title={stats.schoolName}
      subtitle={schoolSubtitle}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Élèves inscrits"
          value={loading ? "—" : stats.studentCount}
          icon={GraduationCap}
        />

        <Stat
          label="Enseignants"
          value={loading ? "—" : stats.teacherCount}
          icon={Users}
        />

        <Stat
          label="Classes"
          value={loading ? "—" : stats.classCount}
          icon={School}
        />

        <Stat
          label="Parents enregistrés"
          value={loading ? "—" : stats.parentCount}
          icon={PhoneCall}
        />

        <Stat
          label="Présents aujourd'hui"
          value={loading ? "—" : stats.presentToday}
          icon={UserCheck}
          tone="success"
        />

        <Stat
          label="Absents aujourd'hui"
          value={loading ? "—" : stats.absentToday}
          icon={UserX}
          tone="warning"
        />

        <Stat
          label="Taux de présence"
          value={
            loading
              ? "—"
              : `${stats.attendanceRate}%`
          }
          icon={CheckCircle2}
          tone="success"
        />

        <Stat
          label="Classes pointées"
          value={
            loading
              ? "—"
              : `${stats.checkedClasses}/${stats.classCount}`
          }
          icon={Clock}
          hint="Appels effectués aujourd'hui"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-[var(--shadow-card)] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Activité récente
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <span
                  className={
                    item.tone === "absence"
                      ? "h-2.5 w-2.5 shrink-0 rounded-full bg-destructive"
                      : item.tone === "success"
                        ? "h-2.5 w-2.5 shrink-0 rounded-full bg-success"
                        : "h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                  }
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {item.label}
                  </p>

                  <p className="truncate text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>

                <span className="text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {item.time}
                </span>
              </div>
            ))}

            {activity.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune activité pour le moment.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                Élèves nécessitant une attention
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {atRisk.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {student.name}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {student.className}
                    </p>
                  </div>

                  <Badge variant="destructive">
                    {student.count} absences ce mois-ci
                  </Badge>
                </div>
              ))}

              {atRisk.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune absence répétée détectée.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">
                Accès rapide
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {[
                {
                  to: "/admin/students",
                  label: "Gérer les élèves",
                },
                {
                  to: "/admin/classes",
                  label: "Gérer les classes",
                },
                {
                  to: "/admin/teachers",
                  label: "Gérer les enseignants",
                },
                {
                  to: "/admin/parents",
                  label: "Numéros des parents",
                },
                {
                  to: "/admin/history",
                  label: "Historique des présences",
                },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="block rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  {item.label}
                </Link>
              ))}

              <p className="pt-2 text-xs text-muted-foreground">
                L'administrateur prépare et gère les
                données. L'enseignant fait simplement
                l'appel.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: "success" | "warning";
  hint?: string;
}) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-start gap-4 p-5">
        <div
          className={
            tone === "success"
              ? "grid h-11 w-11 place-items-center rounded-xl bg-success/15 text-success"
              : tone === "warning"
                ? "grid h-11 w-11 place-items-center rounded-xl bg-warning/20 text-warning-foreground"
                : "grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground"
          }
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {label}
          </p>

          <p className="text-2xl font-semibold">
            {value}
          </p>

          {hint && (
            <p className="text-xs text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Returns today's date in the school's timezone.
 */
function getTodayISO(
  timezone: string | null,
): string {
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          timezone || "Africa/Djibouti",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    );

    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Returns the first day of the current month
 * in the school's timezone.
 */
function getMonthStartISO(
  timezone: string | null,
): string {
  const today = getTodayISO(timezone);

  const [year, month] = today
    .split("-")
    .map(Number);

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function formatToday(): string {
  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Djibouti",
    },
  ).format(new Date());
}

function formatActivityTime(
  value: string,
  timezone: string | null,
): string {
  try {
    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        hour: "2-digit",
        minute: "2-digit",
        timeZone:
          timezone || "Africa/Djibouti",
      },
    ).format(new Date(value));
  } catch {
    return "—";
  }
}