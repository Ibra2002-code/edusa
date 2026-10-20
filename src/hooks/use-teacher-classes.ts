import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

const supabaseClient = supabase as any;

type TeacherClassSession = {
  date: string;
  absentIds: string[];
};

export type TeacherClass = {
  id: string;
  name: string;
  level: string | null;
  studentCount: number;
  lastSession?: TeacherClassSession;
};

type LoadState = {
  classes: TeacherClass[];
  loading: boolean;
  error: string | null;
};

export function useTeacherClasses(): LoadState {
  const { user, profile, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({
    classes: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTeacherClasses() {
      if (authLoading) {
        return;
      }

      if (!user?.id || !profile?.id) {
        setState({ classes: [], loading: false, error: "Utilisateur non authentifié." });
        return;
      }

      setState((current) => ({ ...current, loading: true, error: null }));

      try {
       

        const { data: teacher, error: teacherError } = await supabaseClient
          .from("teachers")
          .select("id, school_id, active")
          .eq("profile_id", profile.id)
          .maybeSingle();

        if (teacherError) throw teacherError;
        if (!teacher) throw new Error("Profil enseignant introuvable.");
        if (!teacher.active) throw new Error("Votre compte enseignant est désactivé.");

       

        const { data: assignments, error: assignmentsError } = await supabaseClient
          .from("teacher_classes")
          .select("teacher_id, class_id")
          .eq("teacher_id", teacher.id);

        if (assignmentsError) throw assignmentsError;

       

        const classIds = (assignments ?? [])
          .map((assignment: { class_id: string }) => assignment.class_id)
          .filter(Boolean);

        if (classIds.length === 0) {
          if (!cancelled) setState({ classes: [], loading: false, error: null });
          return;
        }

        const { data: classRows, error: classesError } = await supabaseClient
          .from("classes")
          .select("id, name, level, school_id, active")
          .eq("school_id", teacher.school_id)
          .eq("active", true)
          .in("id", classIds);

        if (classesError) throw classesError;


        const studentCounts = new Map<string, number>();
        try {
          const { data: students, error: studentsError } = await supabaseClient
            .from("students")
            .select("class_id")
            .eq("school_id", teacher.school_id)
            .eq("active", true)
            .in("class_id", classIds);

          if (studentsError) throw studentsError;
          for (const student of students ?? []) {
            studentCounts.set(student.class_id, (studentCounts.get(student.class_id) ?? 0) + 1);
          }
        } catch (error) {
          console.warn("[EDUSA TEACHER DASHBOARD] student summary unavailable", error);
        }

        const latestSessions = new Map<string, TeacherClassSession>();
        try {
          const { data: sessions, error: sessionsError } = await supabaseClient
            .from("attendance_sessions")
            .select("id, class_id, date, attendance_records(student_id, status)")
            .eq("teacher_id", teacher.id)
            .in("class_id", classIds)
            .order("date", { ascending: false });

          if (sessionsError) throw sessionsError;

          for (const session of sessions ?? []) {
            if (latestSessions.has(session.class_id)) continue;
            const absentIds = (session.attendance_records ?? [])
              .filter((record: { status: string }) => record.status === "absent")
              .map((record: { student_id?: string }) => record.student_id)
              .filter(Boolean);
            latestSessions.set(session.class_id, { date: session.date, absentIds });
          }
        } catch (error) {
          console.warn("[EDUSA TEACHER DASHBOARD] attendance summary unavailable", error);
        }

        const loadedClasses: TeacherClass[] = (classRows ?? []).map((klass: any) => ({
          id: klass.id,
          name: klass.name,
          level: klass.level,
          studentCount: studentCounts.get(klass.id) ?? 0,
          lastSession: latestSessions.get(klass.id),
        }));

        if (!cancelled) setState({ classes: loadedClasses, loading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        setState({
          classes: [],
          loading: false,
          error: error instanceof Error ? error.message : "Impossible de charger vos classes.",
        });
      }
    }

    void loadTeacherClasses();
    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.id, user?.id]);

  return state;
}
