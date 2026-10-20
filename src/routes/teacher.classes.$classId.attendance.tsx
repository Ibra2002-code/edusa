
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Search,
  Send,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { TeacherShell } from "@/components/TeacherShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { requireRole } from "@/lib/auth-route";
import type { Database } from "@/types/database";

export const Route = createFileRoute(
  "/teacher/classes/$classId/attendance",
)({
  beforeLoad: ({ context }) => requireRole(context, "teacher"),

  head: () => ({
    meta: [
      { title: "Faire l'appel — EDUSA" },
      {
        name: "description",
        content:
          "Marquez les élèves absents et enregistrez la présence de votre classe.",
      },
    ],
  }),

  component: AttendancePage,
});

type Step = "mark" | "review" | "done";

type Student = {
  id: string;
  student_number: string | null;
  first_name: string;
  last_name: string | null;
  class_id: string;
  school_id: string;
  active: boolean;
};

type ClassRecord = {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  academic_year: string | null;
  active: boolean;
};

type TeacherRecord = {
  id: string;
  profile_id: string;
  school_id: string;
  active: boolean;
};

type AttendanceSessionInsert = {
  school_id: string;
  class_id: string;
  teacher_id: string;
  date: string;
  started_at: string;
  submitted_at: string;
  status: "draft" | "submitted";
};

type AttendanceSessionRow = {
  id: string;
};

type AttendanceRecordInsert = {
  session_id: string;
  student_id: string;
  status: "present" | "absent";
  marked_at: string;
  notified_at: string | null;
};

type AttendanceSessionUpdate = {
  status?: "draft" | "submitted";
  submitted_at?: string | null;
};

type SessionInsertResult = {
  data: AttendanceSessionRow | null;
  error: {
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  } | null;
};

type RecordsInsertResult = {
  error: {
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  } | null;
};

type AttendanceSessionsTable = {
  insert(values: AttendanceSessionInsert[]): {
    select(column: "id"): {
      single(): Promise<SessionInsertResult>;
    };
  };
  update(values: AttendanceSessionUpdate): {
    eq(column: "id", value: string): Promise<{
      error: {
        code?: string;
        message: string;
        details?: string | null;
        hint?: string | null;
      } | null;
    }>;
  };
};

type AttendanceRecordsTable = {
  insert(values: AttendanceRecordInsert[]): Promise<RecordsInsertResult>;
};

type AttendanceSupabaseClient = {
  from(table: "attendance_sessions"): AttendanceSessionsTable;
  from(table: "attendance_records"): AttendanceRecordsTable;
};

const attendanceSupabase = supabase as unknown as AttendanceSupabaseClient;

function formatToday(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function getStudentName(student: Student): string {
  return `${student.first_name} ${student.last_name ?? ""}`.trim();
}

function AttendancePage() {
  const { classId } = Route.useParams();
  const { user } = useAuth();

  const [klass, setKlass] = useState<ClassRecord | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [absent, setAbsent] = useState<string[]>([]);

  const [step, setStep] = useState<Step>("mark");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceData() {
      if (!classId) {
        setLoading(false);
        setLoadError("Aucune classe sélectionnée.");
        return;
      }

      if (!user?.id) {
        setLoading(false);
        setLoadError("Utilisateur non authentifié.");
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        /*
         * 1. Get the real teacher record.
         *
         * profile_id = authenticated Supabase user id
         */
        const {
          data: teacher,
          error: teacherError,
        } = await supabase
          .from("teachers")
          .select("id, profile_id, school_id, active")
          .eq("profile_id", user.id)
          .maybeSingle<TeacherRecord>();

        if (teacherError) {
          throw new Error(
            `Impossible de récupérer le profil enseignant : ${teacherError.message}`,
          );
        }

        if (!teacher) {
          throw new Error(
            "Aucun enregistrement enseignant n'est associé à votre compte.",
          );
        }

        if (!teacher.active) {
          throw new Error("Votre compte enseignant est désactivé.");
        }

        /*
         * 2. Verify that this teacher is assigned to this exact UUID class.
         */
        const {
          data: assignment,
          error: assignmentError,
        } = await supabase
          .from("teacher_classes")
          .select("teacher_id, class_id")
          .eq("teacher_id", teacher.id)
          .eq("class_id", classId)
          .maybeSingle();

        if (assignmentError) {
          throw new Error(
            `Impossible de vérifier l'affectation de la classe : ${assignmentError.message}`,
          );
        }

        if (!assignment) {
          throw new Error(
            "Vous n'êtes pas affecté à cette classe.",
          );
        }

        /*
         * 3. Load the real class.
         */
        const {
          data: classData,
          error: classError,
        } = await supabase
          .from("classes")
          .select(
            "id, school_id, name, level, academic_year, active",
          )
          .eq("id", classId)
          .eq("school_id", teacher.school_id)
          .maybeSingle<ClassRecord>();

        if (classError) {
          throw new Error(
            `Impossible de récupérer la classe : ${classError.message}`,
          );
        }

        if (!classData) {
          throw new Error("Classe introuvable.");
        }

        if (!classData.active) {
          throw new Error("Cette classe est désactivée.");
        }

        /*
         * 4. Load real students from Supabase.
         *
         * No mock-data is used here.
         */
        const {
          data: students,
          error: studentsError,
        } = await supabase
          .from("students")
          .select(
            "id, student_number, first_name, last_name, class_id, school_id, active",
          )
          .eq("class_id", classId)
          .eq("school_id", teacher.school_id)
          .eq("active", true)
          .order("first_name", { ascending: true })
          .order("last_name", { ascending: true });

        if (studentsError) {
          throw new Error(
            `Impossible de récupérer les élèves : ${studentsError.message}`,
          );
        }

        if (cancelled) {
          return;
        }

        setKlass(classData);
        setRoster(students ?? []);
        setAbsent([]);

        console.info("[EDUSA ATTENDANCE LOAD]", {
          classId: classData.id,
          className: classData.name,
          teacherId: teacher.id,
          schoolId: teacher.school_id,
          students: students?.length ?? 0,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Une erreur inattendue est survenue.";

        console.error("[EDUSA ATTENDANCE LOAD]", error);

        setKlass(null);
        setRoster([]);
        setLoadError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAttendanceData();

    return () => {
      cancelled = true;
    };
  }, [classId, user?.id]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    if (!query) {
      return roster;
    }

    return roster.filter((student) => {
      const fullName = getStudentName(student);

      return (
        fullName.toLowerCase().includes(query) ||
        (student.student_number ?? "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [roster, q]);

  const setStudentAttendance = (
    studentId: string,
    status: "present" | "absent",
  ) => {
    setAbsent((current) => {
      if (status === "absent") {
        return current.includes(studentId)
          ? current
          : [...current, studentId];
      }

      return current.filter((id) => id !== studentId);
    });
  };

  const absentStudents = roster.filter((student) =>
    absent.includes(student.id),
  );

  const presentCount = roster.length - absentStudents.length;

  /*
   * Save one attendance session and all attendance records.
   */
  const submitAttendance = async () => {
    if (!user?.id) {
      toast.error("Session utilisateur introuvable.");
      return;
    }

    if (!klass) {
      toast.error("Classe introuvable.");
      return;
    }

    if (roster.length === 0) {
      toast.error(
        "Aucun élève n'est enregistré dans cette classe.",
      );
      return;
    }

    setSubmitting(true);

    try {
      /*
       * 1. Get the authenticated teacher.
       */
      const {
        data: teacher,
        error: teacherError,
      } = await supabase
        .from("teachers")
        .select("id, profile_id, school_id, active")
        .eq("profile_id", user.id)
        .maybeSingle<TeacherRecord>();

      if (teacherError) {
        throw new Error(
          `Impossible de récupérer le profil enseignant : ${teacherError.message}`,
        );
      }

      if (!teacher) {
        throw new Error(
          "Profil enseignant introuvable.",
        );
      }

      if (!teacher.active) {
        throw new Error(
          "Votre compte enseignant est désactivé.",
        );
      }

      /*
       * 2. Verify the teacher/class assignment again
       * before attempting the INSERT.
       */
      const {
        data: assignment,
        error: assignmentError,
      } = await supabase
        .from("teacher_classes")
        .select("teacher_id, class_id")
        .eq("teacher_id", teacher.id)
        .eq("class_id", classId)
        .maybeSingle();

      if (assignmentError) {
        throw new Error(
          `Impossible de vérifier l'affectation de la classe : ${assignmentError.message}`,
        );
      }

      if (!assignment) {
        throw new Error(
          "Vous n'êtes pas autorisé à enregistrer les présences de cette classe.",
        );
      }

      const now = new Date().toISOString();
      const attendanceDate = now.slice(0, 10);

      const {
        data: existingSession,
        error: existingSessionError,
      } = await supabase
        .from("attendance_sessions")
        .select("id")
        .eq("class_id", classId)
        .eq("teacher_id", teacher.id)
        .eq("date", attendanceDate)
        .maybeSingle();

      if (existingSessionError) {
        throw new Error(
          `Impossible de vérifier une présence déjà enregistrée : ${existingSessionError.message}`,
        );
      }

      if (existingSession) {
        throw new Error(
          "Une présence a déjà été enregistrée pour cette classe aujourd'hui.",
        );
      }

      /*
       * 3. Create attendance session.
       *
       * Important:
       * - school_id = teacher.school_id
       * - class_id = real UUID from Route.useParams()
       * - teacher_id = real teachers.id
       */
      const sessionInsert: AttendanceSessionInsert = {
        school_id: teacher.school_id,
        class_id: classId,
        teacher_id: teacher.id,
        date: attendanceDate,
        started_at: now,
        submitted_at: now,
        status: "submitted",
      };

      const {
        data: session,
        error: sessionError,
      } = await attendanceSupabase
        .from("attendance_sessions")
        .insert([sessionInsert])
        .select("id")
        .single();

      if (sessionError) {
        console.error(
          "[EDUSA ATTENDANCE SESSION INSERT]",
          {
            code: sessionError.code,
            message: sessionError.message,
            details: sessionError.details,
            hint: sessionError.hint,
            teacherId: teacher.id,
            schoolId: teacher.school_id,
            classId,
          },
        );

        throw new Error(
          `Impossible de créer la session de présence : ${sessionError.message}`,
        );
      }

      if (!session) {
        throw new Error(
          "La session de présence n'a pas été créée.",
        );
      }

      /*
       * 4. Create one attendance record for every student.
       */
      const records: AttendanceRecordInsert[] = roster.map((student) => ({
        session_id: session.id,
        student_id: student.id,
        status: absent.includes(student.id)
          ? "absent"
          : "present",
        marked_at: now,
        notified_at: null,
      }));

      const {
        error: recordsError,
      } = await attendanceSupabase
        .from("attendance_records")
        .insert(records);

      if (recordsError) {
        console.error(
          "[EDUSA ATTENDANCE RECORDS INSERT]",
          recordsError,
        );

        /*
         * Roll back the session if records could not be inserted.
         */
        await supabase
          .from("attendance_sessions")
          .delete()
          .eq("id", session.id);

        throw new Error(
          `Impossible d'enregistrer les présences : ${recordsError.message}`,
        );
      }

      const sessionUpdate: Database["public"]["Tables"]["attendance_sessions"]["Update"] = {
        status: "submitted",
        submitted_at: now,
      };

      const {
        error: updateSessionError,
      } = await attendanceSupabase
        .from("attendance_sessions")
        .update(sessionUpdate)
        .eq("id", session.id);

      if (updateSessionError) {
        throw new Error(
          `Impossible de finaliser la présence : ${updateSessionError.message}`,
        );
      }

      console.info("[EDUSA ATTENDANCE SUBMITTED]", {
  sessionId: session.id,
  classId,
  teacherId: teacher.id,
  totalStudents: roster.length,
  present: presentCount,
  absent: absentStudents.length,
});

/*
 * 5. Attendance is now permanently saved.
 *
 * WhatsApp notification is handled separately so that
 * a WhatsApp failure never rolls back attendance.
 */
try {
  const {
    data: whatsappResult,
    error: whatsappError,
  } = await supabase.functions.invoke(
    "send-attendance-whatsapp",
    {
      body: {
        attendance_session_id: session.id,
      },
    },
  );

  if (whatsappError) {
    console.error(
      "[EDUSA WHATSAPP NOTIFICATION ERROR]",
      whatsappError,
    );

    toast.warning(
      "Présences enregistrées, mais l'envoi WhatsApp a échoué.",
    );
  } else if (whatsappResult?.success) {
    const sent = whatsappResult.sent ?? 0;
    const failed = whatsappResult.failed ?? 0;
    const skipped = whatsappResult.skipped ?? 0;

    if (failed > 0) {
      toast.warning(
        `Présences enregistrées. ${sent} notification(s) WhatsApp envoyée(s), ${failed} échec(s).`,
      );
    } else if (sent > 0) {
      toast.success(
        `${sent} notification(s) WhatsApp envoyée(s) aux parents.`,
      );
    } else if (skipped > 0) {
      toast.warning(
        `Présences enregistrées. Aucune notification WhatsApp envoyée (${skipped} ignorée(s)).`,
      );
    } else {
      toast.success(
        "Présences enregistrées. Aucune notification WhatsApp nécessaire.",
      );
    }
  } else {
    console.warn(
      "[EDUSA WHATSAPP NOTIFICATION UNEXPECTED RESPONSE]",
      whatsappResult,
    );

    toast.warning(
      "Présences enregistrées, mais la réponse WhatsApp est inattendue.",
    );
  }
} catch (whatsappError) {
  console.error(
    "[EDUSA WHATSAPP NOTIFICATION EXCEPTION]",
    whatsappError,
  );

  /*
   * IMPORTANT:
   * Do NOT throw here.
   *
   * Attendance has already been saved successfully.
   */
  toast.warning(
    "Présences enregistrées, mais l'envoi WhatsApp a échoué.",
  );
}

setStep("done");
    } catch (error) {
      console.error(
        "[EDUSA ATTENDANCE SUBMIT]",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Une erreur inattendue est survenue.";

      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <TeacherShell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-teal-600" />

          <p className="text-sm font-semibold text-slate-600">
            Chargement de la classe...
          </p>
        </div>
      </TeacherShell>
    );
  }

  if (loadError || !klass) {
    return (
      <TeacherShell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />

          <h1 className="font-bold text-slate-900">
            Impossible de charger la classe
          </h1>

          <p className="mt-2 max-w-md text-sm text-slate-500">
            {loadError ?? "Classe introuvable."}
          </p>

          <Button
            asChild
            className="mt-6"
            variant="outline"
          >
            <Link to="/teacher/dashboard">
              Retour au tableau de bord
            </Link>
          </Button>
        </div>
      </TeacherShell>
    );
  }

  if (roster.length === 0) {
    return (
      <TeacherShell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
          <Users className="mb-4 h-12 w-12 text-slate-300" />

          <h1 className="font-bold text-slate-900">
            Aucun élève dans cette classe
          </h1>

          <p className="mt-2 max-w-md text-sm text-slate-500">
            Aucun élève actif n'est actuellement enregistré
            dans{" "}
            <span className="font-semibold">
              {klass.name}
            </span>
            .
          </p>

          <Button
            asChild
            className="mt-6"
            variant="outline"
          >
            <Link to="/teacher/dashboard">
              Retour au tableau de bord
            </Link>
          </Button>
        </div>
      </TeacherShell>
    );
  }

  if (step === "done") {
    return (
      <TeacherShell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
          <div className="relative mb-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            </div>

            <div className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-teal-600 shadow-lg">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
          </div>

          <h1 className="text-center text-2xl font-bold text-slate-900">
            Présence enregistrée
          </h1>

          <p className="mt-3 max-w-sm text-center text-slate-500">
            Les présences de la classe{" "}
            <span className="font-bold text-slate-700">
              {klass.name}
            </span>{" "}
            ont été enregistrées.
            <br />

            {absentStudents.length > 0 ? (
              <>
                <span className="font-bold text-teal-700">
                  {absentStudents.length} élève(s)
                </span>{" "}
                sont marqué(s) absent(s).
              </>
            ) : (
              <span className="font-bold text-emerald-600">
                Présence enregistrée — Aucun absent
              </span>
            )}
          </p>

          <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
            <Button
              asChild
              size="lg"
              className="h-14 bg-teal-600 text-lg hover:bg-teal-700"
            >
              <Link to="/teacher/dashboard">
                Retour à l'accueil
              </Link>
            </Button>

            <Button
              variant="ghost"
              onClick={() => setStep("mark")}
              className="text-slate-500"
            >
              Revoir l'appel
            </Button>
          </div>
        </div>
      </TeacherShell>
    );
  }

  if (step === "review") {
    return (
      <TeacherShell>
        <div className="pb-32">
          <button
            type="button"
            onClick={() => setStep("mark")}
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-teal-600 transition-colors hover:text-teal-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Modifier l'appel
          </button>

          <h1 className="text-2xl font-bold text-slate-900">
            Vérification de l'appel
          </h1>

          <p className="font-medium capitalize text-slate-500">
            {klass.name} · {formatToday()}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Présents
              </p>

              <p className="text-4xl font-black text-emerald-600">
                {presentCount}
              </p>
            </div>

            <div
              className={cn(
                "rounded-2xl border p-4",
                absentStudents.length > 0
                  ? "border-red-100 bg-red-50"
                  : "border-slate-100 bg-slate-50",
              )}
            >
              <p
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  absentStudents.length > 0
                    ? "text-red-700"
                    : "text-slate-400",
                )}
              >
                Absents
              </p>

              <p
                className={cn(
                  "text-4xl font-black",
                  absentStudents.length > 0
                    ? "text-red-600"
                    : "text-slate-300",
                )}
              >
                {absentStudents.length}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">
              Élèves marqués absents
            </h3>

            <div className="space-y-3">
              {absentStudents.map((student) => (
                <Card
                  key={student.id}
                  className="border-none bg-red-50/30 shadow-sm ring-1 ring-red-100"
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {getStudentName(student)}
                      </p>

                      {student.student_number && (
                        <p className="mt-0.5 font-mono text-xs text-slate-400">
                          {student.student_number}
                        </p>
                      )}
                    </div>

                    <Badge className="border-none bg-red-600 px-3 py-1 text-white">
                      ABSENT
                    </Badge>
                  </CardContent>
                </Card>
              ))}

              {absentStudents.length === 0 && (
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 py-10 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-400" />

                  <p className="text-sm font-medium text-emerald-700">
                    Tous les élèves sont présents !
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="mx-auto max-w-3xl">
            <Button
              size="lg"
              className="h-14 w-full gap-2 bg-teal-600 text-lg font-bold shadow-lg shadow-teal-600/20 hover:bg-teal-700"
              onClick={() => void submitAttendance()}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Notifier les parents
                </>
              )}
            </Button>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell>
      <div className="pb-32">
        <Link
          to="/teacher/dashboard"
          className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-400 transition-colors hover:text-teal-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Mes classes
        </Link>

        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              {klass.name}
            </h1>

            <p className="text-sm font-bold uppercase tracking-wider text-teal-600">
              {formatToday()}
            </p>
          </div>

          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-teal-100 bg-teal-50 text-teal-700">
            <span className="text-xl font-black leading-none">
              {roster.length}
            </span>

            <span className="text-[10px] font-bold uppercase">
              Élèves
            </span>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Rechercher un élève..."
            className="h-12 border-slate-200 bg-white pl-12 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-teal-500"
          />
        </div>

        {q.trim() && (
          <p className="mb-3 px-1 text-xs font-medium text-slate-400">
            {filtered.length} élève
            {filtered.length !== 1 ? "s" : ""} trouvé
            {filtered.length !== 1 ? "s" : ""}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filtered.map((student, index) => {
            const isAbsent = absent.includes(student.id);
            const isPresent = !isAbsent;

            return (
              <div
                key={student.id}
                className={cn(
                  "flex min-h-[68px] items-center gap-4 px-4 py-2.5 transition-colors sm:px-5",
                  index !== filtered.length - 1 &&
                    "border-b border-slate-100",
                  isAbsent
                    ? "bg-red-50/60"
                    : "bg-white hover:bg-slate-50/80",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold sm:text-base",
                      isAbsent
                        ? "text-red-900"
                        : "text-slate-800",
                    )}
                  >
                    {getStudentName(student)}
                  </p>

                  <p
                    className={cn(
                      "mt-0.5 text-[10px] font-bold uppercase tracking-wider sm:text-[11px]",
                      isAbsent
                        ? "text-red-500"
                        : "text-emerald-500",
                    )}
                  >
                    {isAbsent ? "Absent" : "Présent"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    aria-pressed={isPresent}
                    aria-label={`Marquer ${getStudentName(student)} présent`}
                    onClick={() =>
                      setStudentAttendance(
                        student.id,
                        "present",
                      )
                    }
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition-all sm:px-4",
                      isPresent
                        ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
                    )}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Présent
                  </button>

                  <button
                    type="button"
                    aria-pressed={isAbsent}
                    aria-label={`Marquer ${getStudentName(student)} absent`}
                    onClick={() =>
                      setStudentAttendance(
                        student.id,
                        "absent",
                      )
                    }
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition-all sm:px-4",
                      isAbsent
                        ? "border-red-500 bg-red-500 text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700",
                    )}
                  >
                    <UserX className="mr-1.5 h-3.5 w-3.5" />
                    Absent
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />

              <p className="font-semibold">
                Aucun élève ne correspond à votre recherche.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-md sm:p-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="flex shrink-0 flex-col">
            <span className="text-2xl font-black leading-none text-slate-900">
              {presentCount}
            </span>

            <span className="text-[10px] font-bold uppercase tracking-tighter text-emerald-600">
              Présents
            </span>
          </div>

          <div className="h-8 w-px shrink-0 bg-slate-200" />

          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                "text-2xl font-black leading-none",
                absentStudents.length > 0
                  ? "text-red-600"
                  : "text-slate-300",
              )}
            >
              {absentStudents.length}
            </span>

            <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">
              Absents
            </span>
          </div>

          <Button
            size="lg"
            className="h-12 shrink-0 bg-teal-600 px-5 text-base font-black shadow-lg shadow-teal-600/20 hover:bg-teal-700 sm:h-14 sm:px-8 sm:text-lg"
            onClick={() => setStep("review")}
          >
            Vérifier
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </TeacherShell>
  );
}

