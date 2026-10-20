import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

export const Route = createFileRoute("/admin/history")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),

  head: () => ({
    meta: [
      { title: "Historique des présences — EDUSA" },
      {
        name: "description",
        content:
          "Consultez tous les appels effectués : date, classe, enseignant, présents, absents et taux de présence.",
      },
      {
        property: "og:title",
        content: "Historique des présences — EDUSA",
      },
      {
        property: "og:description",
        content:
          "Suivi complet des appels réalisés par les enseignants de l'école.",
      },
    ],
  }),

  component: HistoryPage,
});

type HistoryRow = {
  id: string;
  date: string;
  time: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  presentCount: number;
  absentCount: number;
  notificationStatus:
    | "notified"
    | "partial"
    | "failed"
    | "none";
};

type ClassView = {
  id: string;
  name: string;
};

function HistoryPage() {
  const supabaseClient = supabase as any;

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classId, setClassId] = useState("all");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    setErrorMessage("");

    try {
      /*
       * ---------------------------------------------------------
       * 1. Get current administrator
       * ---------------------------------------------------------
       */

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      /*
       * ---------------------------------------------------------
       * 2. Get administrator school
       * ---------------------------------------------------------
       */

      const { data: adminProfile, error: profileError } =
        await supabaseClient
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .single();

      if (profileError || !adminProfile?.school_id) {
        throw new Error("École administrateur introuvable.");
      }

      const schoolId = adminProfile.school_id;

      /*
       * ---------------------------------------------------------
       * 3. Load active classes
       * ---------------------------------------------------------
       */

      const { data: classRows, error: classesError } =
        await supabaseClient
          .from("classes")
          .select("id, name")
          .eq("school_id", schoolId)
          .eq("active", true)
          .order("name");

      if (classesError) {
        throw classesError;
      }

      const classList: ClassView[] = (classRows ?? []).map(
        (item: {
          id: string;
          name: string;
        }) => ({
          id: item.id,
          name: item.name,
        }),
      );

      setClasses(classList);

      /*
       * ---------------------------------------------------------
       * 4. Load submitted attendance sessions
       * ---------------------------------------------------------
       */

      const { data: sessionRows, error: sessionsError } =
        await supabaseClient
          .from("attendance_sessions")
          .select(
            "id, class_id, teacher_id, date, started_at, submitted_at, status",
          )
          .eq("school_id", schoolId)
          .eq("status", "submitted")
          .order("date", {
            ascending: false,
          })
          .order("started_at", {
            ascending: false,
          });

      if (sessionsError) {
        throw sessionsError;
      }

      if (!sessionRows || sessionRows.length === 0) {
        setRows([]);
        return;
      }

      /*
       * ---------------------------------------------------------
       * 5. Load attendance records for those sessions
       * ---------------------------------------------------------
       */

      const sessionIds = sessionRows.map(
        (session: { id: string }) => session.id,
      );

      const { data: attendanceRows, error: attendanceError } =
        await supabaseClient
          .from("attendance_records")
          .select("id, session_id, status")
          .in("session_id", sessionIds);

      if (attendanceError) {
        throw attendanceError;
      }

      /*
       * ---------------------------------------------------------
       * 6. Load notification records
       * ---------------------------------------------------------
       */

      const attendanceRecordIds = (
        attendanceRows ?? []
      ).map(
        (record: { id: string }) => record.id,
      );

      let notificationRows: {
        attendance_record_id: string;
        status: string;
      }[] = [];

      if (attendanceRecordIds.length > 0) {
        const { data, error: notificationsError } =
          await supabaseClient
            .from("notifications")
            .select(
              "attendance_record_id, status",
            )
            .in(
              "attendance_record_id",
              attendanceRecordIds,
            );

        if (notificationsError) {
          throw notificationsError;
        }

        notificationRows = data ?? [];
      }

      /*
       * ---------------------------------------------------------
       * 7. Load teachers
       * ---------------------------------------------------------
       */

      const teacherIds = Array.from(
        new Set(
          sessionRows.map(
            (session: { teacher_id: string }) =>
              session.teacher_id,
          ),
        ),
      );

      let teacherRows: {
        id: string;
        profile_id: string;
      }[] = [];

      if (teacherIds.length > 0) {
        const { data, error: teachersError } =
          await supabaseClient
            .from("teachers")
            .select("id, profile_id")
            .in("id", teacherIds)
            .eq("school_id", schoolId);

        if (teachersError) {
          throw teachersError;
        }

        teacherRows = data ?? [];
      }

      /*
       * ---------------------------------------------------------
       * 8. Load teacher profiles
       * ---------------------------------------------------------
       */

      const profileIds = teacherRows.map(
        (teacher) => teacher.profile_id,
      );

      let teacherProfiles: {
        id: string;
        full_name: string;
      }[] = [];

      if (profileIds.length > 0) {
        const { data, error: teacherProfilesError } =
          await supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", profileIds)
            .eq("school_id", schoolId);

        if (teacherProfilesError) {
          throw teacherProfilesError;
        }

        teacherProfiles = data ?? [];
      }

      /*
       * ---------------------------------------------------------
       * 9. Create lookup maps
       * ---------------------------------------------------------
       */

      const classMap = new Map<string, string>();

      for (const item of classList) {
        classMap.set(item.id, item.name);
      }

      const teacherProfileIdMap = new Map<
        string,
        string
      >();

      for (const teacher of teacherRows) {
        teacherProfileIdMap.set(
          teacher.id,
          teacher.profile_id,
        );
      }

      const profileNameMap = new Map<
        string,
        string
      >();

      for (const profile of teacherProfiles) {
        profileNameMap.set(
          profile.id,
          profile.full_name,
        );
      }

      /*
       * ---------------------------------------------------------
       * 10. Group attendance records by session
       * ---------------------------------------------------------
       */

      const recordsBySession = new Map<
        string,
        {
          present: number;
          absent: number;
          recordIds: string[];
        }
      >();

      for (const record of attendanceRows ?? []) {
        const current =
          recordsBySession.get(record.session_id) ?? {
            present: 0,
            absent: 0,
            recordIds: [],
          };

        if (record.status === "present") {
          current.present += 1;
        }

        if (record.status === "absent") {
          current.absent += 1;
        }

        current.recordIds.push(record.id);

        recordsBySession.set(
          record.session_id,
          current,
        );
      }

      /*
       * ---------------------------------------------------------
       * 11. Group notifications by attendance record
       * ---------------------------------------------------------
       */

      const notificationsByRecord = new Map<
        string,
        string[]
      >();

      for (const notification of notificationRows) {
        const current =
          notificationsByRecord.get(
            notification.attendance_record_id,
          ) ?? [];

        current.push(notification.status);

        notificationsByRecord.set(
          notification.attendance_record_id,
          current,
        );
      }

      /*
       * ---------------------------------------------------------
       * 12. Build final history rows
       * ---------------------------------------------------------
       */

      const historyRows: HistoryRow[] =
        sessionRows.map(
          (session: {
            id: string;
            class_id: string;
            teacher_id: string;
            date: string;
            started_at: string | null;
          }) => {
            const attendance =
              recordsBySession.get(session.id) ?? {
                present: 0,
                absent: 0,
                recordIds: [],
              };

            const profileId =
              teacherProfileIdMap.get(
                session.teacher_id,
              );

            const teacherName = profileId
              ? profileNameMap.get(profileId) ?? "—"
              : "—";

            let sentCount = 0;
            let failedCount = 0;

            for (const recordId of attendance.recordIds) {
              const statuses =
                notificationsByRecord.get(
                  recordId,
                ) ?? [];

              for (const notificationStatus of statuses) {
                if (
                  notificationStatus === "sent"
                ) {
                  sentCount += 1;
                }

                if (
                  notificationStatus === "failed"
                ) {
                  failedCount += 1;
                }
              }
            }

            let notificationStatus:
              | "notified"
              | "partial"
              | "failed"
              | "none" = "none";

            if (attendance.absent === 0) {
              notificationStatus = "none";
            } else if (
              sentCount >= attendance.absent
            ) {
              notificationStatus = "notified";
            } else if (sentCount > 0) {
              notificationStatus = "partial";
            } else if (failedCount > 0) {
              notificationStatus = "failed";
            }

            const time = session.started_at
              ? new Date(
                  session.started_at,
                ).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";

            return {
              id: session.id,
              date: session.date,
              time,
              classId: session.class_id,
              className:
                classMap.get(session.class_id) ??
                session.class_id,
              teacherId: session.teacher_id,
              teacherName,
              presentCount: attendance.present,
              absentCount: attendance.absent,
              notificationStatus,
            };
          },
        );

      setRows(historyRows);
    } catch (error) {
      console.error(
        "[EDUSA Admin History]",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Impossible de charger l'historique des présences.";

      setErrorMessage(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  /*
   * -----------------------------------------------------------
   * Filter history by class
   * -----------------------------------------------------------
   */

  const filteredRows = useMemo(() => {
    if (classId === "all") {
      return rows;
    }

    return rows.filter(
      (row) => row.classId === classId,
    );
  }, [rows, classId]);

  /*
   * -----------------------------------------------------------
   * Format date for French UI
   * -----------------------------------------------------------
   */

  function formatDateFr(date: string) {
    const parsed = new Date(
      `${date}T00:00:00`,
    );

    return parsed.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  /*
   * -----------------------------------------------------------
   * Render
   * -----------------------------------------------------------
   */

  return (
    <AdminShell
      title="Historique des présences"
      subtitle="Tous les appels enregistrés par les enseignants"
    >
      <Card className="shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <Select
            value={classId}
            onValueChange={setClassId}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
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

          <p className="text-sm text-muted-foreground">
            {filteredRows.length} appel(s)
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Enseignant</TableHead>
                <TableHead>Présents</TableHead>
                <TableHead>Absents</TableHead>
                <TableHead>
                  Taux de présence
                </TableHead>
                <TableHead>Parents</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Chargement de l'historique...
                  </TableCell>
                </TableRow>
              ) : errorMessage ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-destructive"
                  >
                    {errorMessage}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredRows.map((row) => {
                    const total =
                      row.presentCount +
                      row.absentCount;

                    const rate =
                      total === 0
                        ? 0
                        : Math.round(
                            (row.presentCount /
                              total) *
                              100,
                          );

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateFr(row.date)} ·{" "}
                          {row.time}
                        </TableCell>

                        <TableCell className="font-medium">
                          {row.className}
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {row.teacherName}
                        </TableCell>

                        <TableCell className="text-success">
                          {row.presentCount}
                        </TableCell>

                        <TableCell className="text-destructive">
                          {row.absentCount}
                        </TableCell>

                        <TableCell>
                          {rate}%
                        </TableCell>

                        <TableCell>
                          {row.notificationStatus ===
                            "notified" && (
                            <Badge variant="secondary">
                              Notifiés
                            </Badge>
                          )}

                          {row.notificationStatus ===
                            "partial" && (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                              Partiellement notifiés
                            </Badge>
                          )}

                          {row.notificationStatus ===
                            "failed" && (
                            <Badge
                              variant="destructive"
                              className="bg-red-50 text-red-700 border-red-200"
                            >
                              Échec
                            </Badge>
                          )}

                          {row.notificationStatus ===
                            "none" && (
                            <Badge variant="outline">
                              Aucune notification
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Aucun appel enregistré.
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AdminShell>
  );
}