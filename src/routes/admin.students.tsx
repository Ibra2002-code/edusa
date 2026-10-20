
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Upload,
  Trash2,
  FileUp,
  Download,
  CheckCircle2,
  Users,
  Filter,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { requireRole } from "@/lib/auth-route";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/students")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),

  head: () => ({
    meta: [
      { title: "Gestion des Élèves — EDUSA" },
      {
        name: "description",
        content:
          "Gérez la liste des élèves, leur classe et les informations de leur parent.",
      },
    ],
  }),

  component: StudentsPage,
});

type SchoolClass = {
  id: string;
  name: string;
  level: string | null;
  school_id: string;
  active: boolean;
};

type Student = {
  id: string;
  school_id: string;
  class_id: string | null;
  parent_id: string | null;
  student_number: string | null;
  middle_name?: string | null;
  first_name: string;
  last_name: string;
  active: boolean;
};

type StudentRow = Student & {
  className: string;
  classLevel: string | null;
};

function StudentsPage() {
  const supabaseClient = supabase as any;

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [classId, setClassId] = useState("all");
  const [page, setPage] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);

  const PAGE_SIZE = 50;

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [form, setForm] = useState({
    studentNumber: "",
    firstName: "",
    lastName: "",
    classId: "",
  });

  /**
   * Load the authenticated administrator's school.
   *
   * We intentionally load this after the component mounts.
   * This avoids trying to depend on browser-only authentication
   * state during SSR/hydration.
   */
  const loadSchool = async (): Promise<string | null> => {
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    console.log("[EDUSA DEBUG] authenticated user", {
      userId: user?.id ?? null,
      authError: authError?.message ?? null,
    });

    if (authError) {
      throw authError;
    }

    if (!user) {
      throw new Error("Utilisateur non authentifié.");
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();

    console.log("[EDUSA DEBUG] admin profile", {
      data,
      error,
    });

    if (error) {
      throw error;
    }

    if (!data?.school_id) {
      throw new Error(
        "Aucune école n'est associée au profil administrateur.",
      );
    }

    return data.school_id;
  };

  /**
   * Load classes belonging to the administrator's school.
   */
  const loadClasses = async (currentSchoolId: string) => {
    const { data, error } = await supabaseClient
      .from("classes")
      .select("id, name, level, school_id, active")
      .eq("school_id", currentSchoolId)
      .eq("active", true)
      .order("name", { ascending: true });

    console.log("[EDUSA DEBUG] classes result", {
      data,
      error,
    });

    if (error) {
      console.error("[EDUSA DEBUG] classes error details", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      throw error;
    }

    return (data ?? []) as SchoolClass[];
  };

  /**
   * Load one page of students belonging to the administrator's school.
   *
   * Search and class filtering happen in PostgreSQL so the browser never
   * needs to download the school's entire student population.
   */
  const loadStudents = async (
    currentSchoolId: string,
    currentPage: number,
    searchQuery: string,
    currentClassId: string,
  ) => {
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabaseClient
      .from("students")
      .select(
        "id, school_id, class_id, parent_id, student_number, first_name, middle_name, last_name, active",
        { count: "exact" },
      )
      .eq("school_id", currentSchoolId)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true })
      .range(from, to);

    if (currentClassId !== "all") {
      query = query.eq("class_id", currentClassId);
    }

    const normalizedSearch = searchQuery
      .trim()
      .replace(/[,%()]/g, " ")
      .replace(/\s+/g, " ");

    if (normalizedSearch) {
      const searchTerms = normalizedSearch
        .split(" ")
        .filter(Boolean);

      for (const term of searchTerms) {
        const safeTerm = term.replace(/[%_\\]/g, "");

        if (!safeTerm) continue;

        query = query.or(
          [
            `first_name.ilike.%${safeTerm}%`,
            `middle_name.ilike.%${safeTerm}%`,
            `last_name.ilike.%${safeTerm}%`,
            `student_number.ilike.%${safeTerm}%`,
          ].join(","),
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[EDUSA Admin Students] students query failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    setStudents((data ?? []) as Student[]);
    setTotalStudents(count ?? 0);
  };

  /**
   * Load the administrator's school and its active classes.
   * Student rows are loaded separately so filters and pagination can
   * request only the page currently visible to the administrator.
   */
  const loadData = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const currentSchoolId = await loadSchool();

      if (!currentSchoolId) {
        throw new Error("École introuvable.");
      }

      setSchoolId(currentSchoolId);

      const loadedClasses = await loadClasses(currentSchoolId);
      setClasses(loadedClasses);
    } catch (error) {
      console.error("[EDUSA Admin Students] load failed", error);

      const message =
        error instanceof Error
          ? error.message
          : "Impossible de charger les élèves.";

      setLoadError(message);
      setStudents([]);
      setClasses([]);
      setTotalStudents(0);

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await loadData();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        await loadStudents(schoolId, page, debouncedQ, classId);
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof Error
            ? error.message
            : "Impossible de charger les élèves.";

        setLoadError(message);
        setStudents([]);
        setTotalStudents(0);
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [schoolId, page, debouncedQ, classId]);

  /**
   * Convert the current database page into display rows.
   */
  const rows = useMemo<StudentRow[]>(() => {
    const classById = new Map(classes.map((item) => [item.id, item]));

    return students.map((student) => {
      const schoolClass = student.class_id
        ? classById.get(student.class_id)
        : undefined;

      return {
        ...student,
        className: schoolClass?.name ?? "Classe inconnue",
        classLevel: schoolClass?.level ?? null,
      };
    });
  }, [students, classes]);

  const totalPages = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE));
  const pageStart = totalStudents === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, totalStudents);

  /**
   * Reset the add-student form.
   */
  const resetForm = () => {
    setForm({
      studentNumber: "",
      firstName: "",
      lastName: "",
      classId: classes[0]?.id ?? "",
    });
  };

  /**
   * Insert one student into Supabase.
   */
  const handleAddStudent = async () => {
    if (!schoolId) {
      toast.error("École introuvable.");
      return;
    }

    if (!form.firstName.trim()) {
      toast.error("Le prénom de l'élève est requis.");
      return;
    }

    if (!form.lastName.trim()) {
      toast.error("Le nom de famille de l'élève est requis.");
      return;
    }

    if (!form.classId) {
      toast.error("Veuillez sélectionner une classe.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        school_id: schoolId,
        class_id: form.classId,
        parent_id: null,
        student_number: form.studentNumber.trim() || null,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        active: true,
      };

      console.log("[EDUSA DEBUG] inserting student", payload);

      const { data, error } = await supabaseClient
        .from("students")
        .insert(payload)
        .select(
          "id, school_id, class_id, parent_id, student_number, first_name, last_name, active",
        )
        .single();

      console.log("[EDUSA DEBUG] insert student result", {
        data,
        error,
      });

      if (error) {
        console.error("[EDUSA DEBUG] insert student error", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        throw error;
      }

      if (!data) {
        throw new Error("L'élève n'a pas été retourné après création.");
      }

      await loadStudents(schoolId, page, debouncedQ, classId);

      setOpen(false);
      resetForm();

      toast.success("L'élève a été ajouté avec succès.");
    } catch (error) {
      console.error("[EDUSA Admin Students] add student failed", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d'ajouter l'élève.",
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Delete a student from Supabase.
   */
  const handleRemoveStudent = async (student: Student) => {
    if (!schoolId) {
      toast.error("École introuvable.");
      return;
    }

    const fullName = `${student.first_name} ${student.last_name}`;

    const confirmed = window.confirm(
      `Supprimer définitivement l'élève "${fullName}" ?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabaseClient
        .from("students")
        .delete()
        .eq("id", student.id)
        .eq("school_id", schoolId);

      console.log("[EDUSA DEBUG] delete student result", {
        studentId: student.id,
        error,
      });

      if (error) {
        console.error("[EDUSA DEBUG] delete student error", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        throw error;
      }

      const nextTotal = Math.max(0, totalStudents - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));

      if (page > nextTotalPages) {
        setPage(nextTotalPages);
      } else {
        await loadStudents(schoolId, page, debouncedQ, classId);
      }

      toast.success("Fiche élève supprimée.");
    } catch (error) {
      console.error("[EDUSA Admin Students] delete student failed", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de supprimer l'élève.",
      );
    }
  };

  /**
   * Download a simple CSV template.
   *
  * The downloadable template remains available as CSV.
   */
  const downloadTemplate = () => {
    const header =
      "student_number,first_name,middle_name,last_name,class_name,parent_name,parent_whatsapp\n";

    const example =
      "STU-001,Ibrahim,,Hassan,5ème A,Amina Hassan,+25377123456\n";

    const blob = new Blob([header + example], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "edusa-eleves-template.csv";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  };

  /**
  * Parse a CSV file or the first worksheet in an XLSX file.
   *
   * Expected columns:
   *
  * student_number, first_name, middle_name, last_name,
  * class_name, parent_name, parent_whatsapp
   */
  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Le fichier ne doit pas dépasser 5 Mo.");
      return;
    }

    const fileName = file.name.toLowerCase();

    const isCsv = fileName.endsWith(".csv");
    const isXlsx = fileName.endsWith(".xlsx");

    if (!isCsv && !isXlsx) {
      toast.error("Veuillez sélectionner un fichier .csv ou .xlsx.");
      return;
    }

    if (!schoolId) {
      toast.error("École introuvable.");
      return;
    }

    try {
      let headers: string[];
      let dataRows: string[][];

      if (isCsv) {
        const text = await file.text();

        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length < 2) {
          toast.error("Le fichier ne contient aucun élève.");
          return;
        }

        const headerLine = lines[0];

        if (!headerLine) {
          toast.error("Le fichier ne contient pas d'en-tête.");
          return;
        }

        headers = headerLine
          .split(",")
          .map((header) => header.trim().toLowerCase());

        dataRows = lines.slice(1).map((line) =>
          line.split(",").map((value) =>
            value.trim().replace(/^"|"$/g, ""),
          ),
        );
      } else {
        const workbook = XLSX.read(await file.arrayBuffer(), {
          type: "array",
        });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = firstSheetName
          ? workbook.Sheets[firstSheetName]
          : undefined;

        const worksheetRows = firstSheet
          ? XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
              header: 1,
              defval: "",
              raw: false,
              blankrows: false,
            })
          : [];

        if (worksheetRows.length < 2) {
          toast.error("Le fichier ne contient aucun élève.");
          return;
        }

        const headerRow = worksheetRows[0];

        if (!headerRow) {
          toast.error("Le fichier ne contient pas d'en-tête.");
          return;
        }

        headers = headerRow.map((header) =>
          String(header ?? "").trim().toLowerCase(),
        );

        dataRows = worksheetRows.slice(1).map((row) =>
          row.map((value) =>
            String(value ?? "").trim().replace(/^"|"$/g, ""),
          ),
        );
      }

      const requiredHeaders = [
        "student_number",
        "first_name",
        "middle_name",
        "last_name",
        "class_name",
        "parent_name",
        "parent_whatsapp",
      ];

      const missingHeaders = requiredHeaders.filter(
        (header) => !headers.includes(header),
      );

      if (missingHeaders.length > 0) {
        toast.error(
          `Colonnes manquantes : ${missingHeaders.join(", ")}`,
        );
        return;
      }

      const indexOf = (name: string) => headers.indexOf(name);

      const importedRows = dataRows.map((values, index) => {
        return {
          rowNumber: index + 2,
          student_number:
            indexOf("student_number") >= 0
              ? values[indexOf("student_number")] || null
              : null,

          first_name: values[indexOf("first_name")] ?? "",

          middle_name:
            values[indexOf("middle_name")]?.trim() || null,

          last_name: values[indexOf("last_name")] ?? "",

          class_name: values[indexOf("class_name")] ?? "",

          parent_name: values[indexOf("parent_name")] ?? "",

          parent_whatsapp:
            values[indexOf("parent_whatsapp")] ?? "",
        };
      });

      const missingParentRow = importedRows.find(
        (row) =>
          !row.parent_name.trim() || !row.parent_whatsapp.trim(),
      );

      if (missingParentRow) {
        toast.error(
          `Ligne ${missingParentRow.rowNumber} : le nom et le numéro WhatsApp du parent sont obligatoires.`,
        );
        return;
      }

      const invalidRows = importedRows.filter(
        (row) =>
          !row.first_name.trim() ||
          !row.last_name.trim() ||
          !row.class_name.trim(),
      );

      if (invalidRows.length > 0) {
        toast.error(
          `Ligne(s) ${invalidRows.map((row) => row.rowNumber).join(", ")} : first_name, last_name et class_name sont obligatoires.`,
        );
        return;
      }

      const classResolvedRows = [];

      for (const row of importedRows) {
        const schoolClass = classes.find(
          (item) =>
            item.name.trim().toLowerCase() ===
            row.class_name.trim().toLowerCase(),
        );

        if (!schoolClass) {
          throw new Error(
            `Ligne ${row.rowNumber} : classe introuvable dans votre école : "${row.class_name}".`,
          );
        }

        classResolvedRows.push({
          row,
          classId: schoolClass.id,
        });
      }

      const parentIdByWhatsapp = new Map<string, string>();
      const preparedRows = [];

      for (const { row, classId: resolvedClassId } of classResolvedRows) {
        const parentWhatsapp = row.parent_whatsapp.trim();
        let parentId = parentIdByWhatsapp.get(parentWhatsapp);

        if (!parentId) {
          const { data: existingParent, error: parentLookupError } =
            await supabaseClient
              .from("parents")
              .select("id")
              .eq("school_id", schoolId)
              .eq("whatsapp_number", parentWhatsapp)
              .limit(1)
              .maybeSingle();

          if (parentLookupError) {
            throw new Error(
              `Ligne ${row.rowNumber} : impossible de rechercher le parent "${row.parent_name.trim()}" (${parentWhatsapp}) : ${parentLookupError.message}`,
            );
          }

          if (existingParent?.id) {
            parentId = existingParent.id;
          } else {
            const { data: createdParent, error: parentCreateError } =
              await supabaseClient
                .from("parents")
                .insert({
                  school_id: schoolId,
                  full_name: row.parent_name.trim(),
                  whatsapp_number: parentWhatsapp,
                  active: true,
                })
                .select("id")
                .single();

            if (parentCreateError || !createdParent?.id) {
              throw new Error(
                `Ligne ${row.rowNumber} : impossible de créer le parent "${row.parent_name.trim()}" (${parentWhatsapp})${parentCreateError ? ` : ${parentCreateError.message}` : "."}`,
              );
            }

            parentId = createdParent.id;
          }

          if (!parentId) {
            throw new Error(
              `Ligne ${row.rowNumber} : aucun identifiant parent n'a été retourné.`,
            );
          }

          parentIdByWhatsapp.set(parentWhatsapp, parentId);
        }

        preparedRows.push({
          school_id: schoolId,
          class_id: resolvedClassId,
          parent_id: parentId,
          student_number: row.student_number,
          first_name: row.first_name.trim(),
          middle_name: row.middle_name,
          last_name: row.last_name.trim(),
          active: true,
        });
      }

      console.log("[EDUSA DEBUG] prepared import rows", {
        count: preparedRows.length,
        rows: preparedRows,
      });

      const { data, error } = await supabaseClient
        .from("students")
        .insert(preparedRows)
        .select(
          "id, school_id, class_id, parent_id, student_number, first_name, middle_name, last_name, active",
        );

      console.log("[EDUSA DEBUG] import students result", {
        count: data?.length ?? 0,
        data,
        error,
      });

      if (error) {
        console.error("[EDUSA DEBUG] import students error", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        throw error;
      }

      await loadStudents(schoolId, page, debouncedQ, classId);

      setImportOpen(false);

      toast.success(
        `${data?.length ?? 0} élève(s) importé(s) avec succès.`,
      );
    } catch (error) {
      console.error("[EDUSA Admin Students] import failed", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d'importer les élèves.",
      );
    }
  };

  return (
    <AdminShell
      title="Élèves"
      subtitle={`${totalStudents} élèves enregistrés au total`}
      actions={
        <div className="flex items-center gap-2">
          {/* IMPORT */}
          <Dialog
            open={importOpen}
            onOpenChange={setImportOpen}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-teal-200 text-teal-700 hover:bg-teal-50"
              >
                <Upload className="mr-2 h-4 w-4" />
                Importer Excel
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-teal-700">
                  <FileUp className="h-5 w-5" />
                  Importer la liste des élèves
                </DialogTitle>

                <DialogDescription>
                  Importez plusieurs élèves dans l'école actuellement
                  associée à votre compte administrateur.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 py-4">
                <div
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 transition-all hover:border-teal-300 hover:bg-teal-50/50"
                  onClick={() =>
                    document
                      .getElementById("students-file-upload")
                      ?.click()
                  }
                >
                  <FileUp className="mb-3 h-12 w-12 text-slate-400" />

                  <p className="text-sm font-semibold text-slate-900">
                    Cliquez pour sélectionner le fichier
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    CSV et Excel (.xlsx) supportés · 5 Mo maximum
                  </p>

                  <input
                    id="students-file-upload"
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx"
                    onChange={handleImportFile}
                  />
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <Download className="mt-0.5 h-5 w-5 text-blue-600" />

                  <div className="text-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-900">
                      Modèle d'importation
                    </p>

                    <p className="mt-1 text-blue-700">
                      Téléchargez le modèle CSV avant de préparer
                      votre liste.
                    </p>

                    <button
                      type="button"
                      className="mt-2 font-bold text-blue-600 underline hover:text-blue-800"
                      onClick={downloadTemplate}
                    >
                      Télécharger le modèle CSV
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">
                  <strong>Colonnes attendues :</strong>
                  <br />
                  student_number, first_name, middle_name, last_name,
                  class_name, parent_name, parent_whatsapp
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setImportOpen(false)}
                >
                  Annuler
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ADD STUDENT */}
          <Dialog
            open={open}
            onOpenChange={setOpen}
          >
            <DialogTrigger asChild>
              <Button
                className="bg-teal-600 shadow-md hover:bg-teal-700"
                onClick={() => resetForm()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un élève
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvel élève</DialogTitle>

                <DialogDescription>
                  Ajoutez un élève à une classe de votre école.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <Field label="Numéro étudiant">
                  <Input
                    value={form.studentNumber}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        studentNumber: event.target.value,
                      })
                    }
                    placeholder="Ex: STU-001"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Prénom">
                    <Input
                      value={form.firstName}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          firstName: event.target.value,
                        })
                      }
                      placeholder="Ibrahim"
                    />
                  </Field>

                  <Field label="Nom">
                    <Input
                      value={form.lastName}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          lastName: event.target.value,
                        })
                      }
                      placeholder="Hassan"
                    />
                  </Field>
                </div>

                <Field label="Classe">
                  <Select
                    value={form.classId}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        classId: value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir une classe" />
                    </SelectTrigger>

                    <SelectContent>
                      {classes.map((schoolClass) => (
                        <SelectItem
                          key={schoolClass.id}
                          value={schoolClass.id}
                        >
                          {schoolClass.name}
                          {schoolClass.level
                            ? ` (${schoolClass.level})`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

              </div>

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Annuler
                </Button>

                <Button
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={handleAddStudent}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    "Enregistrer l'élève"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ERROR */}
        {loadError && (
          <Card className="border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />

              <div>
                <p className="font-semibold text-red-800">
                  Impossible de charger les élèves
                </p>

                <p className="mt-1 text-sm text-red-700">
                  {loadError}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadData()}
                >
                  Réessayer
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* FILTERS */}
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <Input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher par nom ou numéro..."
                className="h-11 pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />

              <Select
                value={classId}
                onValueChange={(value) => {
                  setClassId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-[220px]">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    Toutes les classes
                  </SelectItem>

                  {classes.map((schoolClass) => (
                    <SelectItem
                      key={schoolClass.id}
                      value={schoolClass.id}
                    >
                      {schoolClass.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* TABLE */}
        <Card className="overflow-hidden border-none shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-600">
                    Élève
                  </TableHead>

                  <TableHead className="font-bold text-slate-600">
                    Numéro
                  </TableHead>

                  <TableHead className="font-bold text-slate-600">
                    Classe
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
                      className="py-20 text-center"
                    >
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Loader2 className="mb-3 h-8 w-8 animate-spin" />

                        <p className="font-medium">
                          Chargement des élèves...
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-20 text-center"
                    >
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Users className="mb-2 h-12 w-12 opacity-20" />

                        <p className="text-lg font-medium">
                          Aucun élève trouvé
                        </p>

                        <p className="text-sm">
                          Essayez de modifier vos filtres ou
                          ajoutez un nouvel élève.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((student) => {
                    const fullName = [
                      student.first_name,
                      student.middle_name?.trim(),
                      student.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <TableRow
                        key={student.id}
                        className="group transition-colors hover:bg-slate-50/50"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                              {student.first_name
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <span className="font-bold text-slate-900">
                              {fullName}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="font-mono text-xs text-slate-500">
                          {student.student_number ?? "—"}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-teal-100 bg-white px-2.5 py-0.5 font-medium text-teal-600"
                          >
                            {student.className}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          {student.active ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" />
                              Actif
                            </div>
                          ) : (
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Inactif
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            onClick={() =>
                              void handleRemoveStudent(student)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {totalStudents > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Affichage de {pageStart} à {pageEnd} sur {totalStudents} élèves
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Précédent
              </Button>

              <span className="min-w-[90px] text-center text-sm font-medium text-slate-600">
                Page {page} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={loading || page >= totalPages}
              >
                Suivant
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </Label>

      {children}
    </div>
  );
}

