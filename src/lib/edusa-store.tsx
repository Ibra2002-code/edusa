import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  classes as seedClasses,
  students as seedStudents,
  teachers as seedTeachers,
  attendanceSessions as seedSessions,
  currentTeacherId,
  todayISO,
  type AttendanceSession,
  type ActivityItem,
  type SchoolClass,
  type Student,
  type Teacher,
} from "./mock-data";

type AttendanceDraft = Record<string, string[]>; // classId -> absent student ids

export type ClassStats = {
  studentCount: number;
  rate: number | null;
  lastSession: AttendanceSession | undefined;
};

type Ctx = {
  students: Student[];
  teachers: Teacher[];
  classes: SchoolClass[];
  sessions: AttendanceSession[];
  attendance: AttendanceDraft;
  activity: ActivityItem[];
  setAbsentees: (classId: string, ids: string[]) => void;
  submitAttendance: (classId: string, absentIds: string[], teacherId: string | null) => void;
  addStudent: (s: Omit<Student, "id" | "active">) => void;
  addStudents: (list: Omit<Student, "id" | "active">[]) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  addClass: (name: string, level: string) => void;
  updateClass: (id: string, patch: Partial<SchoolClass>) => void;
  removeClass: (id: string) => void;
  addTeacher: (t: Omit<Teacher, "id" | "classIds" | "active">) => void;
  updateTeacher: (id: string, patch: Partial<Teacher>) => void;
  removeTeacher: (id: string) => void;
  assignTeacher: (classId: string, teacherId: string | null) => void;
  teacherOf: (classId: string) => Teacher | undefined;
  classOf: (classId: string) => SchoolClass | undefined;
  studentsOf: (classId: string) => Student[];
  sessionsOf: (classId: string) => AttendanceSession[];
  statsOf: (classId: string) => ClassStats;
  absenceCount: (studentId: string) => number;
  currentTeacher: Teacher;
};

const EdusaContext = createContext<Ctx | null>(null);

let seq = 100;
const nextId = (p: string) => `${p}${++seq}`;

const nowTime = () =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date());

export function EdusaProvider({ children }: { children: ReactNode }) {
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [teachers, setTeachers] = useState<Teacher[]>(seedTeachers);
  const [classes, setClasses] = useState<SchoolClass[]>(seedClasses);
  const [sessions, setSessions] = useState<AttendanceSession[]>(seedSessions);
  const [attendance, setAttendance] = useState<AttendanceDraft>({});
  const [events, setEvents] = useState<ActivityItem[]>([]);

  const value = useMemo<Ctx>(() => {
    const teacherOf = (classId: string) => teachers.find((t) => t.classIds.includes(classId));
    const classOf = (classId: string) => classes.find((c) => c.id === classId);
    const studentsOf = (classId: string) => students.filter((s) => s.classId === classId);
    const sessionsOf = (classId: string) =>
      sessions
        .filter((s) => s.classId === classId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const statsOf = (classId: string): ClassStats => {
      const list = sessionsOf(classId);
      const present = list.reduce((n, s) => n + s.presentIds.length, 0);
      const absent = list.reduce((n, s) => n + s.absentIds.length, 0);
      return {
        studentCount: studentsOf(classId).length,
        rate: present + absent === 0 ? null : Math.round((present / (present + absent)) * 100),
        lastSession: list[0],
      };
    };

    const absenceCount = (studentId: string) =>
      sessions.filter((s) => s.absentIds.includes(studentId)).length;

    // Activité récente : événements de session + actions de l'administrateur.
    const sessionEvents: ActivityItem[] = sessions
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : -1))
      .slice(0, 6)
      .flatMap((s) => {
        const cname = classOf(s.classId)?.name ?? s.classId;
        const tname = teachers.find((t) => t.id === s.teacherId)?.name ?? "Enseignant";
        const items: ActivityItem[] = [
          {
            id: `${s.id}-call`,
            label: `${tname} a effectué l'appel de ${cname}`,
            detail: `${s.presentIds.length} présents · ${s.absentIds.length} absents`,
            time: s.time,
            tone: "info",
          },
        ];
        const firstAbsent = students.find((st) => st.id === s.absentIds[0]);
        if (firstAbsent) {
          items.push({
            id: `${s.id}-abs`,
            label: `${firstAbsent.name} marqué absent en ${cname}`,
            detail:
              s.absentIds.length > 1
                ? `et ${s.absentIds.length - 1} autre(s) élève(s)`
                : "Parent informé par WhatsApp",
            time: s.time,
            tone: "absence",
          });
        }
        if (s.notified) {
          items.push({
            id: `${s.id}-notif`,
            label: `${s.absentIds.length} parent(s) ont été notifiés`,
            detail: `${cname} · WhatsApp`,
            time: s.time,
            tone: "success",
          });
        }
        return items;
      });

    const log = (item: Omit<ActivityItem, "id" | "time">) =>
      setEvents((prev) => [{ ...item, id: nextId("e"), time: nowTime() }, ...prev].slice(0, 12));

    return {
      students,
      teachers,
      classes,
      sessions,
      attendance,
      activity: [...events, ...sessionEvents].slice(0, 12),
      setAbsentees: (classId, ids) => setAttendance((a) => ({ ...a, [classId]: ids })),
      submitAttendance: (classId, absentIds, teacherId) => {
        const roster = studentsOf(classId).map((s) => s.id);
        const session: AttendanceSession = {
          id: nextId("h"),
          classId,
          teacherId,
          date: todayISO(),
          time: nowTime(),
          absentIds,
          presentIds: roster.filter((id) => !absentIds.includes(id)),
          notified: true,
        };
        setSessions((prev) => [
          session,
          ...prev.filter((s) => !(s.classId === classId && s.date === session.date)),
        ]);
      },
      addStudent: (s) => {
        setStudents((prev) => [...prev, { ...s, id: nextId("s"), active: true }]);
        log({ label: "Nouvel élève ajouté", detail: s.name, tone: "info" });
      },
      addStudents: (list) => {
        setStudents((prev) => [
          ...prev,
          ...list.map((s) => ({ ...s, id: nextId("s"), active: true })),
        ]);
        log({
          label: `${list.length} élève(s) importés depuis Excel`,
          detail: "Import administrateur",
          tone: "success",
        });
      },
      updateStudent: (id, patch) =>
        setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))),
      removeStudent: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
      addClass: (name, level) => {
        setClasses((prev) => [...prev, { id: nextId("c"), name, level, teacherId: null }]);
        log({ label: "Nouvelle classe créée", detail: name, tone: "info" });
      },
      updateClass: (id, patch) =>
        setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
      removeClass: (id) => {
        setClasses((prev) => prev.filter((c) => c.id !== id));
        setTeachers((prev) =>
          prev.map((t) => ({ ...t, classIds: t.classIds.filter((c) => c !== id) })),
        );
      },
      addTeacher: (t) => {
        setTeachers((prev) => [...prev, { ...t, id: nextId("t"), classIds: [], active: true }]);
        log({ label: "Nouvel enseignant ajouté", detail: t.name, tone: "info" });
      },
      updateTeacher: (id, patch) =>
        setTeachers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
      removeTeacher: (id) => {
        setTeachers((prev) => prev.filter((t) => t.id !== id));
        setClasses((prev) => prev.map((c) => (c.teacherId === id ? { ...c, teacherId: null } : c)));
      },
      assignTeacher: (classId, teacherId) => {
        setClasses((prev) => prev.map((c) => (c.id === classId ? { ...c, teacherId } : c)));
        setTeachers((prev) =>
          prev.map((t) => {
            const without = t.classIds.filter((c) => c !== classId);
            return t.id === teacherId
              ? { ...t, classIds: [...without, classId] }
              : { ...t, classIds: without };
          }),
        );
      },
      teacherOf,
      classOf,
      studentsOf,
      sessionsOf,
      statsOf,
      absenceCount,
      currentTeacher: (teachers.find((t) => t.id === currentTeacherId) ?? teachers[0])!,
    };
  }, [students, teachers, classes, attendance, sessions, events]);

  return <EdusaContext.Provider value={value}>{children}</EdusaContext.Provider>;
}

export function useEdusa() {
  const ctx = useContext(EdusaContext);
  if (!ctx) throw new Error("useEdusa doit être utilisé dans EdusaProvider");
  return ctx;
}
