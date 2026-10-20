import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  BookOpen,
  Mail,
  Phone,
  UserCheck,
  UserX,
  CheckCircle2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Database } from "@/types/database";
import { supabase } from "@/lib/supabase";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/teachers")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),

  head: () => ({
    meta: [
      {
        title: "Gestion des Enseignants — EDUSA",
      },
      {
        name: "description",
        content:
          "Gérez vos enseignants, leurs accès et les classes qu'ils supervisent.",
      },
    ],
  }),

  component: TeachersPage,
});

type TeacherView = {
  id: string;
  profileId: string;
  schoolId: string;
  name: string;
  email: string;
  phone: string;
  active: boolean;
  classIds: string[];
};

type ClassView = {
  id: string;
  name: string;
  level: string | null;
};

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type TeacherRow = Database["public"]["Tables"]["teachers"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type TeacherClassRow = Database["public"]["Tables"]["teacher_classes"]["Row"];

function TeachersPage() {
  const supabaseClient = supabase as any;

  const [teachers, setTeachers] = useState<TeacherView[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [loading, setLoading] = useState(true);

  const [create, setCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [assignId, setAssignId] = useState<string | null>(null);

  const assignTarget = teachers.find(
    (teacher) => teacher.id === assignId,
  );

  useEffect(() => {
    void loadTeachers();
  }, []);

  async function loadTeachers() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      const { data: adminProfile, error: profileError } =
        (await supabaseClient
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .single()) as {
          data: { school_id?: string } | null;
          error: any;
        };

      if (profileError || !adminProfile?.school_id) {
        throw new Error("École administrateur introuvable.");
      }

      const schoolId = adminProfile.school_id;

      const teachersResult = (await supabaseClient
        .from("teachers")
        .select("id, profile_id, active")
        .eq("school_id", schoolId)) as {
        data: TeacherRow[] | null;
        error: any;
      };

      if (teachersResult.error) {
        throw teachersResult.error;
      }

      const profilesResult = (await supabaseClient
        .from("profiles")
        .select("id, full_name, email, phone, active")
        .eq("school_id", schoolId)
        .eq("role", "teacher")) as {
        data: ProfileRow[] | null;
        error: any;
      };

      if (profilesResult.error) {
        throw profilesResult.error;
      }

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

      console.debug("[EDUSA DEBUG] classes result", {
        data: classesResult.data,
        error: classesResult.error,
        count: classesResult.count,
      });

      if (classesResult.error) {
        console.warn(
          "[EDUSA Admin Teachers] Classes could not be loaded:",
          classesResult.error,
        );
        setClasses([]);
      } else {
        setClasses(
          (classesResult.data ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            level: item.level,
          })),
        );
      }

      const assignmentsResult = (await supabaseClient
        .from("teacher_classes")
        .select("teacher_id, class_id")) as {
        data: TeacherClassRow[] | null;
        error: any;
        count?: number | null;
      };

      console.debug("[EDUSA DEBUG] teacher_classes result", {
        data: assignmentsResult.data,
        error: assignmentsResult.error,
        count: assignmentsResult.count,
      });

      const teacherClassAssignments = assignmentsResult.error
        ? []
        : assignmentsResult.data ?? [];

      if (assignmentsResult.error) {
        console.warn(
          "[EDUSA Admin Teachers] Teacher class assignments could not be loaded:",
          assignmentsResult.error,
        );
      }

      const profileMap = new Map<string, ProfileRow>();

      for (const profile of profilesResult.data ?? []) {
        profileMap.set(profile.id, profile);
      }

      const classIdsByTeacher = new Map<string, string[]>();

      for (const assignment of teacherClassAssignments) {
        const current =
          classIdsByTeacher.get(assignment.teacher_id) ?? [];

        current.push(assignment.class_id);

        classIdsByTeacher.set(
          assignment.teacher_id,
          current,
        );
      }

      const mappedTeachers: TeacherView[] = [];

      for (const teacher of (teachersResult.data ?? []) as TeacherRow[]) {
        const profile = profileMap.get(teacher.profile_id);

        if (!profile) {
          continue;
        }

        mappedTeachers.push({
          id: teacher.id,
          profileId: teacher.profile_id,
          schoolId: teacher.school_id,
          name: profile.full_name,
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          active: Boolean(
            teacher.active && profile.active,
          ),
          classIds:
            classIdsByTeacher.get(teacher.id) ?? [],
        });
      }

      setTeachers(mappedTeachers);
    } catch (error) {
      console.error(
        "[EDUSA Admin Teachers]",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de charger les enseignants.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createTeacher() {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!name) {
      toast.error("Le nom est obligatoire.");
      return;
    }

    if (!email) {
      toast.error("L'e-mail est obligatoire.");
      return;
    }

    setCreating(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabaseClient.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Session administrateur introuvable.",
        );
      }

      const { data, error } =
        await supabaseClient.functions.invoke(
          "invite-teacher",
          {
            body: {
              full_name: name,
              email,
              phone: phone || null,
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ??
            "Impossible de créer le compte enseignant.",
        );
      }

      setForm({
        name: "",
        email: "",
        phone: "",
      });

      setCreate(false);

      toast.success(
        "Compte enseignant créé. Un e-mail d'invitation a été envoyé.",
      );

      await loadTeachers();
    } catch (error) {
      console.error(
        "[EDUSA Admin Teachers] create",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de créer le compte enseignant.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function saveTeacher() {
    if (!editId) {
      return;
    }

    const name = edit.name.trim();
    const phone = edit.phone.trim();

    if (!name) {
      toast.error("Le nom est obligatoire.");
      return;
    }

    const teacher = teachers.find(
      (item) => item.id === editId,
    );

    if (!teacher) {
      toast.error("Enseignant introuvable.");
      return;
    }

    setSavingEdit(true);

    try {
      const { error } = await supabaseClient
        .from("profiles")
        .update({
          full_name: name,
          phone: phone || null,
        })
        .eq("id", teacher.profileId);

      if (error) {
        throw error;
      }

      setTeachers((current) =>
        current.map((item) =>
          item.id === teacher.id
            ? {
                ...item,
                name,
                phone,
              }
            : item,
        ),
      );

      setEditId(null);

      toast.success("Profil mis à jour.");
    } catch (error) {
      console.error(
        "[EDUSA Admin Teachers] update",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour le profil.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleTeacherStatus(
    teacher: TeacherView,
  ) {
    const nextActive = !teacher.active;

    try {
      const { error: profileError } =
        await supabaseClient
          .from("profiles")
          .update({
            active: nextActive,
          })
          .eq("id", teacher.profileId);

      if (profileError) {
        throw profileError;
      }

      const { error: teacherError } =
        await supabaseClient
          .from("teachers")
          .update({
            active: nextActive,
          })
          .eq("id", teacher.id);

      if (teacherError) {
        throw teacherError;
      }

      setTeachers((current) =>
        current.map((item) =>
          item.id === teacher.id
            ? {
                ...item,
                active: nextActive,
              }
            : item,
        ),
      );

      toast.success(
        nextActive
          ? "Compte enseignant réactivé."
          : "Compte enseignant suspendu.",
      );
    } catch (error) {
      console.error(
        "[EDUSA Admin Teachers] status",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier le statut enseignant.",
      );
    }
  }

  async function reloadTeacherAssignments(
    teacherId: string,
  ) {
    const assignmentsResult = (await supabaseClient
      .from("teacher_classes")
      .select("teacher_id, class_id")
      .eq("teacher_id", teacherId)) as {
      data: TeacherClassRow[] | null;
      error: any;
      count?: number | null;
    };

    console.debug("[EDUSA DEBUG] teacher_classes result", {
      data: assignmentsResult.data,
      error: assignmentsResult.error,
      count: assignmentsResult.count,
    });

    if (assignmentsResult.error) {
      throw assignmentsResult.error;
    }

    const classIds = (assignmentsResult.data ?? []).map(
      (assignment) => assignment.class_id,
    );

    setTeachers((current) =>
      current.map((teacher) =>
        teacher.id === teacherId
          ? {
              ...teacher,
              classIds,
            }
          : teacher,
      ),
    );

    return classIds;
  }

  function openClassAssignment(teacher: TeacherView) {
    console.debug("[EDUSA DEBUG] selected teacher", {
      data: teacher,
      error: null,
      count: 1,
    });

    setAssignId(teacher.id);

    void reloadTeacherAssignments(teacher.id).catch((error) => {
      console.error(
        "[EDUSA Admin Teachers] assignments reload",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de charger les classes attribuées.",
      );
    });
  }

  async function toggleClassAssignment(
    classId: string,
    checked: boolean,
  ) {
    if (!assignId) {
      return;
    }

    try {
      if (checked) {
        const assignment = {
          teacher_id: assignId,
          class_id: classId,
        };

        const insertResult = (await supabaseClient
          .from("teacher_classes")
          .insert(assignment)) as {
          data: TeacherClassRow[] | null;
          error: any;
          count?: number | null;
        };

        console.debug("[EDUSA DEBUG] assignment insert", {
          data: insertResult.data,
          error: insertResult.error,
          count: insertResult.count,
        });

        if (
          insertResult.error &&
          insertResult.error.code !== "23505"
        ) {
          throw insertResult.error;
        }

        await reloadTeacherAssignments(assignId);
        toast.success("Classe attribuée à l'enseignant.");
      } else {
        const deleteResult = (await supabaseClient
          .from("teacher_classes")
          .delete()
          .eq("teacher_id", assignId)
          .eq("class_id", classId)) as {
          data: TeacherClassRow[] | null;
          error: any;
          count?: number | null;
        };

        console.debug("[EDUSA DEBUG] assignment delete", {
          data: deleteResult.data,
          error: deleteResult.error,
          count: deleteResult.count,
        });

        if (deleteResult.error) {
          throw deleteResult.error;
        }

        await reloadTeacherAssignments(assignId);
        toast.success("Classe retirée de l'enseignant.");
      }
    } catch (error) {
      console.error(
        "[EDUSA Admin Teachers] assignment",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier l'attribution.",
      );
    }
  }

  return (
    <AdminShell
      title="Enseignants"
      subtitle={`${teachers.length} comptes enseignants configurés`}
      actions={
        <Button
          onClick={() => setCreate(true)}
          className="bg-teal-600 hover:bg-teal-700 shadow-md"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un enseignant
        </Button>
      }
    >
      <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-bold text-slate-600">
                Enseignant
              </TableHead>

              <TableHead className="font-bold text-slate-600">
                Contact
              </TableHead>

              <TableHead className="font-bold text-slate-600">
                Classes assignées
              </TableHead>

              <TableHead className="font-bold text-slate-600">
                Statut
              </TableHead>

              <TableHead className="text-right font-bold text-slate-600">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-sm text-slate-400"
                >
                  Chargement des enseignants...
                </TableCell>
              </TableRow>
            ) : teachers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-sm text-slate-400"
                >
                  Aucun enseignant configuré.
                </TableCell>
              </TableRow>
            ) : (
              teachers.map((teacher) => (
                <TableRow
                  key={teacher.id}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-700 font-bold border border-teal-100">
                        {teacher.name.charAt(0)}
                      </div>

                      <div>
                        <p className="font-bold text-slate-900">
                          {teacher.name}
                        </p>

                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                          ID: {teacher.id}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Mail className="h-3 w-3 text-teal-500" />
                        {teacher.email || "—"}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Phone className="h-3 w-3 text-teal-500" />
                        {teacher.phone || "—"}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                      {teacher.classIds.length === 0 ? (
                        <span className="text-xs italic text-slate-400">
                          Aucune classe assignée
                        </span>
                      ) : (
                        teacher.classIds.map(
                          (classId) => (
                            <Badge
                              key={classId}
                              variant="secondary"
                              className="bg-teal-50 text-teal-700 border-teal-100 font-medium"
                            >
                              {classes.find(
                                (item) =>
                                  item.id ===
                                  classId,
                              )?.name ?? classId}
                            </Badge>
                          ),
                        )
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={
                        teacher.active
                          ? "secondary"
                          : "outline"
                      }
                      className={
                        teacher.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : "text-slate-400"
                      }
                    >
                      {teacher.active
                        ? "Actif"
                        : "Inactif"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openClassAssignment(teacher)
                        }
                        className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 font-bold"
                      >
                        <BookOpen className="mr-2 h-4 w-4" />
                        Classes
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                        onClick={() => {
                          setEditId(teacher.id);

                          setEdit({
                            name: teacher.name,
                            email: teacher.email,
                            phone: teacher.phone,
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className={
                          teacher.active
                            ? "text-slate-300 hover:text-orange-500"
                            : "text-emerald-500"
                        }
                        onClick={() =>
                          void toggleTeacherStatus(
                            teacher,
                          )
                        }
                      >
                        {teacher.active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal : Nouvel Enseignant */}
      <Dialog
        open={create}
        onOpenChange={setCreate}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-teal-700 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nouvel enseignant
            </DialogTitle>

            <DialogDescription>
              Créez un compte pour un nouveau membre
              du personnel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Nom complet
              </Label>

              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                  })
                }
                placeholder="Ex: Amina Abdirahman"
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Adresse e-mail pro
              </Label>

              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                placeholder="nom.prenom@ecole.dj"
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Numéro de téléphone
              </Label>

              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone: event.target.value,
                  })
                }
                placeholder="+253 77 ..."
                className="h-11 font-mono"
              />
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
              className="bg-teal-600 hover:bg-teal-700 font-bold px-8"
              onClick={() => void createTeacher()}
              disabled={creating}
            >
              {creating
                ? "Création..."
                : "Créer le compte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal : Modifier Enseignant */}
      <Dialog
        open={editId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Modifier le profil
            </DialogTitle>

            <DialogDescription>
              Mettez à jour les coordonnées de
              l'enseignant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Nom
              </Label>

              <Input
                value={edit.name}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    name: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                E-mail
              </Label>

              <Input
                value={edit.email}
                disabled
                className="h-11 bg-slate-50 text-slate-500"
              />

              <p className="text-[11px] text-slate-400">
                L'adresse e-mail de connexion est
                gérée par le compte Auth.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Téléphone
              </Label>

              <Input
                value={edit.phone}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    phone: event.target.value,
                  })
                }
                className="h-11 font-mono"
              />
            </div>
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
              className="bg-teal-600 hover:bg-teal-700 font-bold"
              onClick={() => void saveTeacher()}
              disabled={savingEdit}
            >
              {savingEdit
                ? "Enregistrement..."
                : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal : Assigner des classes */}
      <Dialog
        open={assignId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssignId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-teal-700 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Attribution des classes
            </DialogTitle>

            <DialogDescription>
              Cochez les classes que{" "}
              <span className="font-bold text-slate-900">
                {assignTarget?.name}
              </span>{" "}
              devra gérer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4 max-h-[350px] overflow-y-auto pr-2">
            {classes.map((schoolClass) => {
              const checked =
                assignTarget?.classIds.includes(
                  schoolClass.id,
                ) ?? false;

              return (
                <label
                  key={schoolClass.id}
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all hover:bg-teal-50/50 ${
                    checked
                      ? "border-teal-500 bg-teal-50/30"
                      : "border-slate-100"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    className="h-5 w-5 data-[state=checked]:bg-teal-600"
                    onCheckedChange={(value) => {
                      void toggleClassAssignment(
                        schoolClass.id,
                        value === true,
                      );
                    }}
                  />

                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {schoolClass.name}
                    </p>

                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {schoolClass.level ?? ""}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              className="bg-teal-600 hover:bg-teal-700 font-bold w-full h-11"
              onClick={() => setAssignId(null)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Terminer l'attribution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}