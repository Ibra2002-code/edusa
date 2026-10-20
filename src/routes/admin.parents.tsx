
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  MessageCircle,
  User,
  Phone,
  ShieldCheck,
  AlertCircle,
  School,
  Filter,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

import { supabase } from "@/lib/supabase";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/parents")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),

  head: () => ({
    meta: [
      { title: "Contacts Parents — EDUSA" },
      {
        name: "description",
        content:
          "Vérifiez les numéros WhatsApp des parents pour garantir la bonne réception des notifications d'absence.",
      },
    ],
  }),

  component: ParentsPage,
});

type ParentRow = {
  id: string;
  school_id: string;
  full_name: string;
  whatsapp_number: string | null;
  active: boolean;
};

type StudentRow = {
  id: string;
  school_id: string;
  class_id: string;
  parent_id: string | null;
  student_number: string | null;
  first_name: string;
  last_name: string;
  active: boolean;
};

type ClassRow = {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  active: boolean;
};

type ParentDisplayRow = {
  id: string;
  parentName: string;
  parentPhone: string;
  parentActive: boolean;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  classLevel: string;
  studentActive: boolean;
};

type WhatsappStatus = "ok" | "invalid" | "inactive";

export function whatsappStatus(
  phone: string,
  active: boolean,
): WhatsappStatus {
  if (!active) {
    return "inactive";
  }

  const digits = phone.replace(/\D/g, "");

  return digits.length >= 8 ? "ok" : "invalid";
}

function ParentsPage() {
  const supabaseClient = supabase as any;

  const [rows, setRows] = useState<ParentDisplayRow[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");

  const [parentCount, setParentCount] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 50;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    void loadParents();
  }, [debouncedQ, status, page]);

  function sanitizeSearch(value: string) {
    return value.replace(/[,%()]/g, " ").trim();
  }

  async function loadParents() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        throw new Error("Utilisateur non authentifié.");
      }

      const profileResult = (await supabaseClient
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .single()) as unknown as {
        data: { school_id?: string } | null;
        error: any;
      };

      if (profileResult.error) {
        throw profileResult.error;
      }

      if (!profileResult.data?.school_id) {
        throw new Error(
          "Aucune école n'est associée au compte administrateur.",
        );
      }

      const currentSchoolId = profileResult.data.school_id;
      setSchoolId(currentSchoolId);

      /*
       * The parent count is fetched with HEAD + exact count instead of
       * loading every parent record into the browser.
       */
      const parentCountResult = await supabase
        .from("parents")
        .select("id", { count: "exact", head: true })
        .eq("school_id", currentSchoolId);

      if (parentCountResult.error) {
        throw parentCountResult.error;
      }

      setParentCount(parentCountResult.count ?? 0);

      const search = sanitizeSearch(debouncedQ);

      /*
       * Search terms that belong to parents/classes are resolved to IDs first.
       * The final paginated query still runs against students, because the UI
       * displays one row per student/parent relationship.
       */
      let searchParentIds: string[] = [];
      let searchClassIds: string[] = [];

      if (search) {
        const [parentSearchResult, classSearchResult] = await Promise.all([
          supabase
            .from("parents")
            .select("id")
            .eq("school_id", currentSchoolId)
            .or(
              `full_name.ilike.%${search}%,whatsapp_number.ilike.%${search}%`,
            ),
          supabase
            .from("classes")
            .select("id")
            .eq("school_id", currentSchoolId)
            .eq("active", true)
            .or(`name.ilike.%${search}%,level.ilike.%${search}%`),
        ]);

        if (parentSearchResult.error) {
          throw parentSearchResult.error;
        }

        if (classSearchResult.error) {
          throw classSearchResult.error;
        }

        searchParentIds = (parentSearchResult.data ?? []).map(
          (row: { id: string }) => row.id,
        );
        searchClassIds = (classSearchResult.data ?? []).map(
          (row: { id: string }) => row.id,
        );
      }

      /*
       * Status filtering remains compatible with the existing whatsappStatus()
       * rule. It is only evaluated when the admin selects a status filter.
       */
      let statusParentIds: string[] | null = null;

      if (status !== "all") {
        const statusParentResult = await supabase
          .from("parents")
          .select("id, whatsapp_number, active")
          .eq("school_id", currentSchoolId);

        if (statusParentResult.error) {
          throw statusParentResult.error;
        }

        statusParentIds = (statusParentResult.data ?? [])
          .filter((parent: ParentRow) => {
            return (
              whatsappStatus(
                parent.whatsapp_number ?? "",
                Boolean(parent.active),
              ) === status
            );
          })
          .map((parent: ParentRow) => parent.id);
      }

      /*
       * If a selected filter has no matching parent IDs, there is no need
       * to issue a large students query.
       */
      if (statusParentIds && statusParentIds.length === 0) {
        setRows([]);
        setTotalRows(0);
        return;
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let studentQuery = supabase
        .from("students")
        .select(
          "id, school_id, class_id, parent_id, student_number, first_name, last_name, active",
          { count: "exact" },
        )
        .eq("school_id", currentSchoolId)
        .not("parent_id", "is", null)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .range(from, to);

      if (statusParentIds) {
        studentQuery = studentQuery.in("parent_id", statusParentIds);
      }

      if (search) {
        const searchParts = [
          `first_name.ilike.%${search}%`,
          `last_name.ilike.%${search}%`,
          `student_number.ilike.%${search}%`,
        ];

        if (searchParentIds.length > 0) {
          searchParts.push(`parent_id.in.(${searchParentIds.join(",")})`);
        }

        if (searchClassIds.length > 0) {
          searchParts.push(`class_id.in.(${searchClassIds.join(",")})`);
        }

        studentQuery = studentQuery.or(searchParts.join(","));
      }

      const studentsResult = await studentQuery;

      if (studentsResult.error) {
        throw studentsResult.error;
      }

      const studentRows = (studentsResult.data ?? []) as StudentRow[];
      const studentParentIds = Array.from(
        new Set(
          studentRows
            .map((student) => student.parent_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const studentClassIds = Array.from(
        new Set(studentRows.map((student) => student.class_id)),
      );

      /*
       * Only load parents/classes needed by the current page.
       * This replaces the previous full-school table loads.
       */
      const [parentsResult, classesResult] = await Promise.all([
        studentParentIds.length > 0
          ? supabase
              .from("parents")
              .select("id, school_id, full_name, whatsapp_number, active")
              .eq("school_id", currentSchoolId)
              .in("id", studentParentIds)
          : Promise.resolve({ data: [], error: null }),
        studentClassIds.length > 0
          ? supabase
              .from("classes")
              .select("id, school_id, name, level, active")
              .eq("school_id", currentSchoolId)
              .in("id", studentClassIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (parentsResult.error) {
        throw parentsResult.error;
      }

      if (classesResult.error) {
        throw classesResult.error;
      }

      const parentMap = new Map<string, ParentRow>(
        ((parentsResult.data ?? []) as ParentRow[]).map((parent) => [
          parent.id,
          parent,
        ]),
      );

      const classMap = new Map<string, ClassRow>(
        ((classesResult.data ?? []) as ClassRow[]).map((schoolClass) => [
          schoolClass.id,
          schoolClass,
        ]),
      );

      const displayRows: ParentDisplayRow[] = [];

      for (const student of studentRows) {
        if (!student.parent_id) {
          continue;
        }

        const parent = parentMap.get(student.parent_id);

        if (!parent) {
          continue;
        }

        const schoolClass = classMap.get(student.class_id);

        displayRows.push({
          id: `${parent.id}-${student.id}`,
          parentName: parent.full_name || "Parent sans nom",
          parentPhone: parent.whatsapp_number || "",
          parentActive: Boolean(parent.active),
          studentId: student.id,
          studentName:
            `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() ||
            "Élève sans nom",
          classId: student.class_id,
          className: schoolClass?.name ?? "Classe inconnue",
          classLevel: schoolClass?.level ?? "",
          studentActive: Boolean(student.active),
        });
      }

      setRows(displayRows);
      setTotalRows(studentsResult.count ?? 0);
    } catch (error) {
      console.error("[EDUSA Admin Parents] load error", error);

      const message =
        error instanceof Error
          ? error.message
          : "Impossible de charger les contacts parents.";

      setErrorMessage(message);
      toast.error(message);

      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }

  const rowsWithStatus = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        st: whatsappStatus(row.parentPhone, row.parentActive),
      })),
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const firstRow = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, totalRows);

  const validWhatsappCount = rowsWithStatus.filter(
    (row) => row.st === "ok",
  ).length;

  const invalidWhatsappCount = rowsWithStatus.filter(
    (row) => row.st === "invalid",
  ).length;

  const goToPreviousPage = () => {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  };

  const goToNextPage = () => {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  };

  return (
    <AdminShell
      title="Parents"
      subtitle={`${parentCount} contact${parentCount > 1 ? "s" : ""} parent${parentCount > 1 ? "s" : ""} enregistré${parentCount > 1 ? "s" : ""}`}
    >
      <div className="space-y-4">
        {/* État de chargement */}
        {loading && (
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-center gap-3 p-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              <span className="text-sm font-medium">
                Chargement des contacts parents...
              </span>
            </div>
          </Card>
        )}

        {/* Erreur */}
        {!loading && errorMessage && (
          <Card className="border-red-100 bg-red-50 shadow-sm ring-1 ring-red-200">
            <div className="flex items-start gap-3 p-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

              <div className="flex-1">
                <p className="font-bold text-red-900">
                  Impossible de charger les parents
                </p>

                <p className="mt-1 text-sm text-red-700">
                  {errorMessage}
                </p>

                <button
                  type="button"
                  onClick={() => void loadParents()}
                  className="mt-3 text-sm font-bold text-red-700 underline hover:text-red-900"
                >
                  Réessayer
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Contenu */}
        {!loading && !errorMessage && (
          <>
            {/* Barre de filtres */}
            <Card className="border-none shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher par parent, élève, classe ou téléphone..."
                    className="h-11 pl-10"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-400" />

                  <Select
                    value={status}
                    onValueChange={setStatus}
                  >
                    <SelectTrigger className="h-11 w-[220px]">
                      <SelectValue placeholder="Tous les statuts" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="all">
                        Tous les parents
                      </SelectItem>

                      <SelectItem value="ok">
                        WhatsApp vérifié
                      </SelectItem>

                      <SelectItem value="invalid">
                        Numéro incomplet
                      </SelectItem>

                      <SelectItem value="inactive">
                        Compte inactif
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* Résumé */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-none shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                    <Users className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Parents
                    </p>

                    <p className="text-xl font-bold text-slate-900">
                      {parentCount}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="border-none shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      WhatsApp valides
                    </p>

                    <p className="text-xl font-bold text-slate-900">
                      {validWhatsappCount}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="border-none shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Numéros à vérifier
                    </p>

                    <p className="text-xl font-bold text-slate-900">
                      {invalidWhatsappCount}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Tableau */}
            <Card className="overflow-hidden border-none shadow-sm ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-600">
                        Parent / Tuteur
                      </TableHead>

                      <TableHead className="font-bold text-slate-600">
                        Élève associé
                      </TableHead>

                      <TableHead className="font-bold text-slate-600">
                        Classe
                      </TableHead>

                      <TableHead className="font-bold text-slate-600">
                        Téléphone WhatsApp
                      </TableHead>

                      <TableHead className="font-bold text-slate-600">
                        Statut Notification
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {rowsWithStatus.map((row) => (
                      <TableRow
                        key={row.id}
                        className="group transition-colors hover:bg-slate-50/50"
                      >
                        {/* Parent */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-500 transition-colors group-hover:border-teal-100 group-hover:bg-teal-50 group-hover:text-teal-700">
                              {row.parentName
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <span className="font-bold text-slate-900">
                              {row.parentName}
                            </span>
                          </div>
                        </TableCell>

                        {/* Élève */}
                        <TableCell>
                          <div className="flex items-center gap-2 text-slate-600">
                            <User className="h-3.5 w-3.5 text-slate-400" />

                            <span className="text-sm font-medium">
                              {row.studentName}
                            </span>
                          </div>
                        </TableCell>

                        {/* Classe */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <School className="h-3.5 w-3.5 text-slate-400" />

                            <div>
                              <p className="text-xs font-bold text-slate-600">
                                {row.className}
                              </p>

                              {row.classLevel && (
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  {row.classLevel}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Téléphone */}
                        <TableCell>
                          <div className="flex w-fit items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 font-mono text-sm font-semibold text-slate-900">
                            <Phone className="h-3 w-3 text-teal-600" />

                            {row.parentPhone || "—"}
                          </div>
                        </TableCell>

                        {/* Statut */}
                        <TableCell>
                          {row.st === "ok" && (
                            <Badge className="flex w-fit items-center gap-1.5 border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle2 className="h-3.5 w-3.5" />

                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Vérifié / Actif
                              </span>
                            </Badge>
                          )}

                          {row.st === "invalid" && (
                            <Badge
                              variant="destructive"
                              className="flex w-fit items-center gap-1.5 border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
                            >
                              <AlertCircle className="h-3.5 w-3.5" />

                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Numéro invalide
                              </span>
                            </Badge>
                          )}

                          {row.st === "inactive" && (
                            <Badge
                              variant="outline"
                              className="flex w-fit items-center gap-1.5 border-slate-200 text-slate-400"
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Inactif
                              </span>
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                    {rowsWithStatus.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-20 text-center"
                        >
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <MessageCircle className="mb-2 h-12 w-12 opacity-10" />

                            <p className="text-lg font-medium">
                              Aucun contact trouvé
                            </p>

                            <p className="text-sm">
                              Vérifiez l'orthographe ou modifiez votre
                              filtre.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>


            {/* Pagination */}
            {totalRows > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Affichage de {firstRow} à {lastRow} sur {totalRows} lignes
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousPage}
                    disabled={page === 1 || loading}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Précédent
                  </button>

                  <span className="min-w-[100px] text-center text-sm font-semibold text-slate-600">
                    Page {page} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={goToNextPage}
                    disabled={page >= totalPages || loading}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}

            {/* Note informative */}
            <div className="flex items-start gap-3 rounded-xl border border-teal-100/50 bg-teal-50/50 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-teal-600" />

              <div className="text-sm text-teal-800">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest">
                  Protection des données
                </p>

                <p className="opacity-80">
                  Ces numéros sont uniquement utilisés pour l'envoi
                  automatisé des notifications d'absence via EDUSA.
                  Veillez à ce qu'ils soient au format international si
                  nécessaire.
                </p>
              </div>
            </div>

            {/* Debug discret */}
            <div className="text-[10px] text-slate-300">
              École: {schoolId ?? "—"} · {totalRows} lignes · page {page}/{totalPages}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
