
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  School,
  GraduationCap,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/lib/supabase";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/classes")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),

  head: () => ({
    meta: [
      { title: "Gestion des Classes — EDUSA" },
      {
        name: "description",
        content:
          "Créez vos classes, suivez leurs effectifs et assignez un enseignant.",
      },
    ],
  }),

  component: ClassesPage,
});

type ClassView = {
  id: string;
  name: string;
  level: string | null;
  studentCount: number;
  teacherId: string | null;
};

type TeacherView = {
  id: string;
  profileId: string;
  name: string;
  active: boolean;
  classIds: string[];
};

type ClassRow = {
  id: string;
  name: string;
  level: string | null;
};

type TeacherRow = {
  id: string;
  profile_id: string;
  active: boolean;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  active: boolean;
};

type StudentRow = {
  class_id: string | null;
};

type TeacherClassRow = {
  teacher_id: string;
  class_id: string;
};

function ClassesPage() {
  const supabaseClient = supabase as any;

  const [classes, setClasses] = useState<ClassView[]>([]);
  const [teachers, setTeachers] = useState<TeacherView[]>([]);
  const [loading, setLoading] = useState(true);

  const [create, setCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    level: "Collège",
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [assignId, setAssignId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      /*
       * Get the authenticated administrator's school.
       * RLS on profiles allows the current user to read their own profile.
       */
      const adminProfileResult = (await supabaseClient
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .single()) as {
          data: { school_id?: string } | null;
          error: any;
          count?: number | null;
        };

      const adminProfile = adminProfileResult.data;
      const adminProfileError = adminProfileResult.error;

      if (adminProfileError) {
        throw adminProfileError;
      }

      if (!adminProfile?.school_id) {
        throw new Error("École administrateur introuvable.");
      }

      const schoolId = adminProfile.school_id;

      /*
       * Load the school's active classes.
       */
      const classesResult = (await supabaseClient
          .from("classes")
          .select("id, name, level")
          .eq("school_id", schoolId)
          .eq("active", true)
          .order("name")) as {
          data: ClassRow[] | null;
          error: any;
          count?: number | null;
        };

      const classRows = classesResult.data;
      const classesError = classesResult.error;

      if (classesError) {
        throw classesError;
      }

      /*
       * Load active teachers and their profiles in one query.
       * This avoids fetching the same teacher population twice.
       */
      const { data: teacherRows, error: teachersError } =
        (await supabaseClient
          .from("teachers")
          .select(`
            id,
            profile_id,
            active,
            profile:profiles!inner(
              id,
              full_name,
              active
            )
          `)
          .eq("school_id", schoolId)
          .eq("active", true)
          .eq("profile.school_id", schoolId)
          .eq("profile.role", "teacher")
          .eq("profile.active", true)) as {
          data:
            | (TeacherRow & {
                profile: ProfileRow;
              })[]
            | null;
          error: any;
        };

      if (teachersError) {
        throw teachersError;
      }

      /*
       * Load teacher/class assignments.
       */
      const { data: assignmentRows, error: assignmentsError } =
        (await supabaseClient
          .from("teacher_classes")
          .select("teacher_id, class_id")) as {
          data: TeacherClassRow[] | null;
          error: any;
        };

      if (assignmentsError) {
        throw assignmentsError;
      }

      /*
       * Load active students belonging to this school.
       *
       * We only need class_id because the UI displays
       * the number of students in each class.
       */
      const { data: studentRows, error: studentsError } =
        (await supabaseClient
          .from("students")
          .select("class_id")
          .eq("school_id", schoolId)
          .eq("active", true)) as {
          data: StudentRow[] | null;
          error: any;
        };

      if (studentsError) {
        throw studentsError;
      }

      /*
       * Build a map:
       * class_id -> number of active students
       */
      const studentCountByClass = new Map<string, number>();

      for (const student of studentRows ?? []) {
        if (!student.class_id) {
          continue;
        }

        studentCountByClass.set(
          student.class_id,
          (studentCountByClass.get(student.class_id) ?? 0) + 1,
        );
      }

      /*
       * Build a map:
       * teacher_id -> assigned class IDs
       */
      const classIdsByTeacher = new Map<string, string[]>();

      for (const assignment of assignmentRows ?? []) {
        const current =
          classIdsByTeacher.get(assignment.teacher_id) ?? [];

        current.push(assignment.class_id);
        classIdsByTeacher.set(assignment.teacher_id, current);
      }

      /*
       * Convert database teachers into the UI model.
       */
      const mappedTeachers: TeacherView[] = (teacherRows ?? []).map(
        (teacher) => ({
          id: teacher.id,
          profileId: teacher.profile_id,
          name: teacher.profile?.full_name ?? "Enseignant",
          active: Boolean(teacher.active && teacher.profile?.active),
          classIds: classIdsByTeacher.get(teacher.id) ?? [],
        }),
      );

      /*
       * Build reverse lookup:
       * class_id -> teacher_id
       *
       * The existing UI represents one "responsable" per class.
       */
      const teacherByClass = new Map<string, string>();

      for (const assignment of assignmentRows ?? []) {
        if (!teacherByClass.has(assignment.class_id)) {
          teacherByClass.set(
            assignment.class_id,
            assignment.teacher_id,
          );
        }
      }

      /*
       * Convert database classes into the UI model.
       */
      const mappedClasses: ClassView[] = (classRows ?? []).map(
        (classRow) => ({
          id: classRow.id,
          name: classRow.name,
          level: classRow.level,
          studentCount: studentCountByClass.get(classRow.id) ?? 0,
          teacherId: teacherByClass.get(classRow.id) ?? null,
        }),
      );

      setTeachers(mappedTeachers);
      setClasses(mappedClasses);
    } catch (error) {
      console.error("[EDUSA Admin Classes] load", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de charger les classes.",
      );

      setClasses([]);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }

  async function createClass() {
    const name = form.name.trim();
    const level = form.level.trim();

    if (!name) {
      toast.error("Le nom de la classe est obligatoire.");
      return;
    }

    setCreating(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      const { data: adminProfile, error: profileError } =
        await supabaseClient
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .single();

      if (profileError) {
        throw profileError;
      }

      if (!adminProfile?.school_id) {
        throw new Error("École administrateur introuvable.");
      }

      const { error } = await supabaseClient.from("classes").insert({
        school_id: adminProfile.school_id,
        name,
        level,
        active: true,
      });

      if (error) {
        throw error;
      }

      setForm({
        name: "",
        level: "Collège",
      });

      setCreate(false);

      toast.success("Classe créée avec succès.");

      await loadData();
    } catch (error) {
      console.error("[EDUSA Admin Classes] create", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de créer la classe.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function saveClass() {
    if (!editId) {
      return;
    }

    const name = editName.trim();

    if (!name) {
      toast.error("Le nom de la classe est obligatoire.");
      return;
    }

    setSavingEdit(true);

    try {
      const { error } = await supabaseClient
        .from("classes")
        .update({
          name,
        })
        .eq("id", editId);

      if (error) {
        throw error;
      }

      setClasses((current) =>
        current.map((item) =>
          item.id === editId
            ? {
                ...item,
                name,
              }
            : item,
        ),
      );

      setEditId(null);

      toast.success("Modifications enregistrées.");
    } catch (error) {
      console.error("[EDUSA Admin Classes] update", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier la classe.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteClass(classId: string, className: string) {
    try {
      /*
       * Soft delete:
       * keep the database record but mark it inactive.
       */
      const { error } = await supabaseClient
        .from("classes")
        .update({
          active: false,
        })
        .eq("id", classId);

      if (error) {
        throw error;
      }

      setClasses((current) =>
        current.filter((item) => item.id !== classId),
      );

      toast.success("Classe supprimée.");
    } catch (error) {
      console.error("[EDUSA Admin Classes] delete", {
        classId,
        className,
        error,
      });

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de supprimer la classe.",
      );
    }
  }

  async function assignTeacher(
    classId: string,
    teacherId: string | null,
  ) {
    setAssigning(true);

    try {
      /*
       * The current UI has one responsible teacher per class.
       *
       * Remove the existing assignment for this class first.
       * RLS verifies that both the teacher and class belong
       * to the administrator's school.
       */
      const { error: deleteError } = await supabaseClient
        .from("teacher_classes")
        .delete()
        .eq("class_id", classId);

      if (deleteError) {
        throw deleteError;
      }

      /*
       * If a new teacher was selected, create the new assignment.
       */
      if (teacherId) {
        const { error: insertError } = await supabaseClient
          .from("teacher_classes")
          .insert({
            teacher_id: teacherId,
            class_id: classId,
          });

        if (insertError) {
          throw insertError;
        }
      }

      /*
       * Update local state immediately.
       */
      setClasses((current) =>
        current.map((item) =>
          item.id === classId
            ? {
                ...item,
                teacherId,
              }
            : item,
        ),
      );

      setTeachers((current) =>
        current.map((teacher) => {
          const withoutCurrentClass = teacher.classIds.filter(
            (id) => id !== classId,
          );

          if (teacher.id === teacherId) {
            return {
              ...teacher,
              classIds: [...withoutCurrentClass, classId],
            };
          }

          return {
            ...teacher,
            classIds: withoutCurrentClass,
          };
        }),
      );

      if (teacherId) {
        const teacher = teachers.find(
          (item) => item.id === teacherId,
        );

        toast.success(
          `${teacher?.name ?? "L'enseignant"} est maintenant responsable de la classe.`,
        );
      } else {
        toast.success("Responsable retiré.");
      }

      setAssignId(null);
    } catch (error) {
      console.error("[EDUSA Admin Classes] assign teacher", {
        classId,
        teacherId,
        error,
      });

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier l'enseignant responsable.",
      );
    } finally {
      setAssigning(false);
    }
  }

  const assignTarget = classes.find(
    (classItem) => classItem.id === assignId,
  );

  const currentTeacherId = assignTarget?.teacherId ?? null;

  return (
    <AdminShell
      title="Classes"
      subtitle={`${classes.length} classes configurées pour l'établissement`}
      actions={
        <Button
          onClick={() => setCreate(true)}
          className="bg-teal-600 hover:bg-teal-700 shadow-md"
          disabled={loading}
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter une classe
        </Button>
      }
    >
      {/* Grille des Classes */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Card
              key={item}
              className="border-none shadow-sm ring-1 ring-slate-200"
            >
              <CardContent className="p-6">
                <div className="space-y-4 animate-pulse">
                  <div className="h-10 w-10 rounded-xl bg-slate-200" />
                  <div className="h-5 w-32 rounded bg-slate-200" />
                  <div className="h-4 w-20 rounded bg-slate-200" />
                  <div className="h-20 rounded-2xl bg-slate-100" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : classes.length === 0 ? (
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <School className="h-7 w-7" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Aucune classe configurée
            </h3>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              Créez votre première classe pour commencer à organiser les
              élèves et les enseignants.
            </p>

            <Button
              onClick={() => setCreate(true)}
              className="mt-5 bg-teal-600 hover:bg-teal-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une classe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const teacher = teachers.find(
              (t) => t.id === c.teacherId,
            );

            const studentCount = c.studentCount;

            return (
              <Card
                key={c.id}
                className="group overflow-hidden border-none shadow-sm ring-1 ring-slate-200 transition-all hover:ring-teal-500/30 hover:shadow-md"
              >
                <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
                        <School className="h-5 w-5" />
                      </div>

                      <div>
                        <CardTitle className="text-xl font-bold text-slate-900">
                          {c.name}
                        </CardTitle>

                        <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest">
                          {c.level ?? "Niveau non défini"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-5">
                  {/* Statistiques rapides */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <Users className="h-4 w-4" />
                      </div>

                      <span className="text-sm font-bold text-slate-700">
                        {studentCount} élèves
                      </span>
                    </div>
                  </div>

                  {/* Enseignant assigné */}
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 transition-colors group-hover:bg-teal-50/30 group-hover:border-teal-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Enseignant Responsable
                    </p>

                    <div className="flex items-center gap-2">
                      {teacher ? (
                        <>
                          <div className="h-6 w-6 rounded-full bg-teal-100 flex items-center justify-center">
                            <UserCheck className="h-3.5 w-3.5 text-teal-700" />
                          </div>

                          <p className="text-sm font-bold text-slate-900">
                            {teacher.name}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm font-medium text-slate-400 italic">
                          Aucun enseignant assigné
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAssignId(c.id)}
                      className="flex-1 border-teal-100 text-teal-700 hover:bg-teal-50 font-bold"
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Assigner
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                      onClick={() => {
                        setEditId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 text-slate-300 hover:text-red-500 hover:bg-red-50"
                      onClick={() => {
                        if (
                          confirm(
                            `Supprimer la classe ${c.name} ?`,
                          )
                        ) {
                          void deleteClass(c.id, c.name);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal : Création */}
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-teal-700 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nouvelle classe
            </DialogTitle>

            <DialogDescription>
              Définissez le nom et le niveau de la nouvelle section.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">
                Nom de la classe
              </Label>

              <Input
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                placeholder="Ex: 5ème A, Terminale S..."
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">
                Niveau scolaire
              </Label>

              <Select
                value={form.level}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    level: v,
                  })
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Primaire">
                    Enseignement Primaire
                  </SelectItem>

                  <SelectItem value="Collège">
                    Enseignement Moyen (Collège)
                  </SelectItem>

                  <SelectItem value="Lycée">
                    Enseignement Secondaire (Lycée)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="ghost"
              onClick={() => setCreate(false)}
              disabled={creating}
            >
              Annuler
            </Button>

            <Button
              className="bg-teal-600 hover:bg-teal-700 px-8"
              onClick={() => void createClass()}
              disabled={creating}
            >
              {creating ? "Création..." : "Créer la classe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal : Modification */}
      <Dialog
        open={editId !== null}
        onOpenChange={(o) => !o && setEditId(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Modifier la classe</DialogTitle>

            <DialogDescription>
              Modifiez le nom d'identification de la classe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label className="text-xs font-bold uppercase text-slate-500">
              Désignation
            </Label>

            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-11 font-bold"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditId(null)}
              disabled={savingEdit}
            >
              Annuler
            </Button>

            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => void saveClass()}
              disabled={savingEdit}
            >
              {savingEdit ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal : Assignation d'enseignant */}
      <Dialog
        open={assignId !== null}
        onOpenChange={(o) => !o && setAssignId(null)}
      >
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-teal-700 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Responsable de classe
            </DialogTitle>

            <DialogDescription>
              L'enseignant sélectionné pourra effectuer l'appel pour cette
              classe depuis son espace personnel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4 max-h-[300px] overflow-y-auto pr-2">
            {teachers.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                <GraduationCap className="mx-auto mb-2 h-6 w-6 text-slate-400" />

                <p className="text-sm font-semibold text-slate-600">
                  Aucun enseignant disponible
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Créez d'abord un compte enseignant.
                </p>
              </div>
            ) : (
              teachers.map((t) => {
                const isCurrentTeacher =
                  currentTeacherId === t.id;

                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={assigning}
                    onClick={() => {
                      if (assignId) {
                        void assignTeacher(assignId, t.id);
                      }
                    }}
                    className={`group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                      isCurrentTeacher
                        ? "border-teal-500 bg-teal-50"
                        : "border-slate-100 bg-white hover:border-teal-500 hover:bg-teal-50"
                    } ${assigning ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-teal-100">
                        <GraduationCap className="h-4 w-4 text-slate-500 group-hover:text-teal-600" />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {t.name}
                        </p>

                        <p className="text-[10px] text-slate-400 font-semibold uppercase">
                          {t.classIds.length} classe(s) actuelle(s)
                        </p>
                      </div>
                    </div>

                    <ChevronRight
                      className={`h-4 w-4 ${
                        isCurrentTeacher
                          ? "text-teal-500"
                          : "text-slate-300 group-hover:text-teal-500"
                      }`}
                    />
                  </button>
                );
              })
            )}

            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
                disabled={assigning || !currentTeacherId}
                onClick={() => {
                  if (assignId) {
                    void assignTeacher(assignId, null);
                  }
                }}
              >
                Désassigner le responsable actuel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

