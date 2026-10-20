import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AttendanceRequest = {
  attendance_session_id?: string;
};

type AttendanceSession = {
  id: string;
  school_id: string;
  class_id: string;
  teacher_id: string;
  date: string;
  status: "draft" | "submitted";
};

type AttendanceRecord = {
  id: string;
  student_id: string;
  status: "present" | "absent";
};

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  parent_id: string | null;
  school_id: string;
};

type Parent = {
  id: string;
  full_name: string;
  whatsapp_number: string | null;
};

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeWhatsappNumber(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("whatsapp:")) {
    return trimmed;
  }

  return `whatsapp:${trimmed}`;
}

function getStudentName(student: Student): string {
  return `${student.first_name} ${student.last_name ?? ""}`.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Méthode non autorisée.",
      },
      405,
    );
  }

  try {
    /*
     * ------------------------------------------------------------
     * 1. Environment
     * ------------------------------------------------------------
     */

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL")?.trim() ?? "";

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";

    const accountSid =
      Deno.env.get("TWILIO_ACCOUNT_SID")?.trim() ?? "";

    const authToken =
      Deno.env.get("TWILIO_AUTH_TOKEN")?.trim() ?? "";

    const rawFrom =
      Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim() ?? "";

    const contentSid =
      Deno.env.get("TWILIO_CONTENT_SID")?.trim() ?? "";

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !serviceRoleKey ||
      !accountSid ||
      !authToken ||
      !rawFrom ||
      !contentSid
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Configuration serveur incomplète.",
        },
        500,
      );
    }

    const from = normalizeWhatsappNumber(rawFrom);

    /*
     * ------------------------------------------------------------
     * 2. Authenticate the teacher
     * ------------------------------------------------------------
     */

    const authorization =
      req.headers.get("Authorization") ?? "";

    if (!authorization.startsWith("Bearer ")) {
      return jsonResponse(
        {
          success: false,
          error: "Authentification requise.",
        },
        401,
      );
    }

    const jwt = authorization.substring("Bearer ".length).trim();

    if (!jwt) {
      return jsonResponse(
        {
          success: false,
          error: "Jeton d'authentification manquant.",
        },
        401,
      );
    }

    /*
     * Client using the teacher's JWT.
     * Used only to identify the authenticated user.
     */
    const userSupabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        },
      },
    );

    const {
      data: {
        user,
      },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "Session utilisateur invalide.",
        },
        401,
      );
    }

    /*
     * Service-role client.
     *
     * This is server-side only.
     * It lets the function read parents without exposing
     * parent data to the teacher's browser.
     */
    const adminSupabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    /*
     * ------------------------------------------------------------
     * 3. Validate request
     * ------------------------------------------------------------
     */

    let body: AttendanceRequest;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "JSON invalide.",
        },
        400,
      );
    }

    const attendanceSessionId =
      body.attendance_session_id?.trim();

    if (!attendanceSessionId) {
      return jsonResponse(
        {
          success: false,
          error: "attendance_session_id est requis.",
        },
        400,
      );
    }

    /*
     * ------------------------------------------------------------
     * 4. Find the teacher
     * ------------------------------------------------------------
     */

    const {
      data: teacher,
      error: teacherError,
    } = await adminSupabase
      .from("teachers")
      .select("id, profile_id, school_id, active")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (teacherError) {
      console.error(
        "[EDUSA WHATSAPP] Teacher lookup failed:",
        teacherError.message,
      );

      return jsonResponse(
        {
          success: false,
          error: "Impossible de vérifier le compte enseignant.",
        },
        500,
      );
    }

    if (!teacher) {
      return jsonResponse(
        {
          success: false,
          error: "Compte enseignant introuvable.",
        },
        403,
      );
    }

    if (!teacher.active) {
      return jsonResponse(
        {
          success: false,
          error: "Compte enseignant désactivé.",
        },
        403,
      );
    }

    /*
     * ------------------------------------------------------------
     * 5. Find the attendance session
     * ------------------------------------------------------------
     */

    const {
      data: session,
      error: sessionError,
    } = await adminSupabase
      .from("attendance_sessions")
      .select(
        "id, school_id, class_id, teacher_id, date, status",
      )
      .eq("id", attendanceSessionId)
      .maybeSingle<AttendanceSession>();

    if (sessionError) {
      console.error(
        "[EDUSA WHATSAPP] Session lookup failed:",
        sessionError.message,
      );

      return jsonResponse(
        {
          success: false,
          error: "Impossible de récupérer la session de présence.",
        },
        500,
      );
    }

    if (!session) {
      return jsonResponse(
        {
          success: false,
          error: "Session de présence introuvable.",
        },
        404,
      );
    }

    /*
     * ------------------------------------------------------------
     * 6. Security: teacher owns this attendance session
     * ------------------------------------------------------------
     */

    if (
      session.teacher_id !== teacher.id ||
      session.school_id !== teacher.school_id
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Vous n'êtes pas autorisé à notifier cette session.",
        },
        403,
      );
    }

    if (session.status !== "submitted") {
      return jsonResponse(
        {
          success: false,
          error:
            "La session de présence doit être finalisée avant l'envoi.",
        },
        409,
      );
    }

    /*
     * ------------------------------------------------------------
     * 7. Get absent attendance records
     * ------------------------------------------------------------
     */

    const {
  data: absentRecords,
  error: recordsError,
} = await adminSupabase
  .from("attendance_records")
  .select("id, student_id, status")
  .eq("session_id", session.id)
  .eq("status", "absent")
  .is("notified_at", null);

    if (recordsError) {
      console.error(
        "[EDUSA WHATSAPP] Attendance records lookup failed:",
        recordsError.message,
      );

      return jsonResponse(
        {
          success: false,
          error: "Impossible de récupérer les élèves absents.",
        },
        500,
      );
    }

    const records = (absentRecords ?? []) as AttendanceRecord[];

    if (records.length === 0) {
      return jsonResponse({
        success: true,
        attendance_session_id: session.id,
        total_absent: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        results: [],
      });
    }

    /*
     * ------------------------------------------------------------
     * 8. Get students
     * ------------------------------------------------------------
     */

    const studentIds = [
      ...new Set(records.map((record) => record.student_id)),
    ];

    const {
      data: students,
      error: studentsError,
    } = await adminSupabase
      .from("students")
      .select(
        "id, first_name, last_name, parent_id, school_id",
      )
      .in("id", studentIds)
      .eq("school_id", teacher.school_id);

    if (studentsError) {
      console.error(
        "[EDUSA WHATSAPP] Student lookup failed:",
        studentsError.message,
      );

      return jsonResponse(
        {
          success: false,
          error: "Impossible de récupérer les informations des élèves.",
        },
        500,
      );
    }

    const studentRows = (students ?? []) as Student[];

    const studentById = new Map(
      studentRows.map((student) => [
        student.id,
        student,
      ]),
    );

    /*
     * ------------------------------------------------------------
     * 9. Get parents
     * ------------------------------------------------------------
     */

    const parentIds = [
      ...new Set(
        studentRows
          .map((student) => student.parent_id)
          .filter(
            (parentId): parentId is string =>
              Boolean(parentId),
          ),
      ),
    ];

    const parentsById = new Map<string, Parent>();

    if (parentIds.length > 0) {
      const {
        data: parents,
        error: parentsError,
      } = await adminSupabase
        .from("parents")
        .select("id, full_name, whatsapp_number")
        .in("id", parentIds)
        .eq("school_id", teacher.school_id);

      if (parentsError) {
        console.error(
          "[EDUSA WHATSAPP] Parent lookup failed:",
          parentsError.message,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Impossible de récupérer les informations des parents.",
          },
          500,
        );
      }

      for (const parent of (parents ?? []) as Parent[]) {
        parentsById.set(parent.id, parent);
      }
    }

    /*
     * ------------------------------------------------------------
     * 10. Send WhatsApp messages
     * ------------------------------------------------------------
     */

    const results: Array<{
      attendance_record_id: string;
      student_id: string;
     status:
  | "sent"
  | "failed"
  | "missing_parent"
  | "missing_whatsapp";

error_message?: string;
twilio_code?: number;
    }> = [];

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    const twilioUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const credentials = btoa(
      `${accountSid}:${authToken}`,
    );

    for (const record of records) {
      const student = studentById.get(record.student_id);

      if (!student || !student.parent_id) {
        skipped++;

        results.push({
          attendance_record_id: record.id,
          student_id: record.student_id,
          status: "missing_parent",
        });

        continue;
      }

      const parent = parentsById.get(student.parent_id);

      if (!parent) {
        skipped++;

        results.push({
          attendance_record_id: record.id,
          student_id: record.student_id,
          status: "missing_parent",
        });

        continue;
      }

      if (!parent.whatsapp_number?.trim()) {
        skipped++;

        results.push({
          attendance_record_id: record.id,
          student_id: record.student_id,
          status: "missing_whatsapp",
        });

        continue;
      }

      const to = normalizeWhatsappNumber(
        parent.whatsapp_number,
      );

      /*
       * Use the existing Twilio Content Template.
       *
       * IMPORTANT:
       * We deliberately do not send Body when using ContentSid.
       */
      const form = new URLSearchParams();

      form.append("To", to);
      form.append("From", from);
      form.append("ContentSid", contentSid);

      /*
       * For the first real test we use the existing
       * Twilio-approved template without ContentVariables.
       *
       * Once we confirm the complete EDUSA flow works,
       * we can connect template variables to:
       * - parent name
       * - student name
       * - class
       * - date
       */
      let notificationId: string | null = null;

      const {
        data: notification,
        error: notificationInsertError,
      } = await adminSupabase
        .from("notifications")
        .insert({
          school_id: teacher.school_id,
          attendance_record_id: record.id,
          parent_id: parent.id,
          channel: "whatsapp",
          status: "pending",
          message_preview: `Absence de ${getStudentName(student)}`,
        })
        .select("id")
        .single();
if (notificationInsertError || !notification) {
  failed++;

  results.push({
    attendance_record_id: record.id,
    student_id: record.student_id,
    status: "failed",
    error_message:
      notificationInsertError?.message ??
      "La notification n'a pas pu être créée.",
  });

  continue;
}
      notificationId = notification.id;

      try {
        const twilioResponse = await fetch(
          twilioUrl,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Type":
                "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: form.toString(),
          },
        );

        const twilioText =
          await twilioResponse.text();

        let twilioData: {
          sid?: string;
          message?: string;
          code?: number;
        } = {};

        try {
          twilioData = JSON.parse(twilioText);
        } catch {
          // Keep empty object if Twilio response is not JSON.
        }

        if (!twilioResponse.ok) {
          failed++;

          await adminSupabase
            .from("notifications")
            .update({
              status: "failed",
              error_message:
                twilioData.message ??
                "Twilio a refusé l'envoi.",
            })
            .eq("id", notificationId);

          results.push({
  attendance_record_id: record.id,
  student_id: record.student_id,
  status: "failed",
  error_message:
    twilioData.message ??
    "Twilio a refusé l'envoi.",
  twilio_code: twilioData.code,
});

          continue;
        }

        const now = new Date().toISOString();

        await adminSupabase
          .from("notifications")
          .update({
            status: "sent",
            provider_message_id:
              twilioData.sid ?? null,
            sent_at: now,
          })
          .eq("id", notificationId);

        await adminSupabase
          .from("attendance_records")
          .update({
            notified_at: now,
          })
          .eq("id", record.id);

        sent++;

        results.push({
          attendance_record_id: record.id,
          student_id: record.student_id,
          status: "sent",
        });
      } catch (error) {
        failed++;

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Erreur inconnue lors de l'envoi.";

        await adminSupabase
          .from("notifications")
          .update({
            status: "failed",
            error_message: errorMessage,
          })
          .eq("id", notificationId);

       results.push({
  attendance_record_id: record.id,
  student_id: record.student_id,
  status: "failed",
  error_message: errorMessage,
});
      }
    }

    /*
     * ------------------------------------------------------------
     * 11. Return summary
     * ------------------------------------------------------------
     */

    return jsonResponse({
      success: failed === 0,
      attendance_session_id: session.id,
      total_absent: records.length,
      sent,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    console.error(
      "[EDUSA WHATSAPP] Unexpected error:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return jsonResponse(
      {
        success: false,
        error: "Une erreur inattendue est survenue.",
      },
      500,
    );
  }
});