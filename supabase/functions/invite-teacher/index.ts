import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteTeacherRequest = {
  full_name?: string;
  email?: string;
  phone?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      {
        success: false,
        error: "Configuration Supabase serveur incomplète.",
      },
      500,
    );
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse(
      {
        success: false,
        error: "Authentification requise.",
      },
      401,
    );
  }

  const accessToken = authorization.replace("Bearer ", "").trim();

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    /*
     * 1. Identify the authenticated user.
     */
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

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
     * 2. Verify that the caller is an active administrator.
     */
    const { data: adminProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, school_id, role, active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[invite-teacher] Admin profile lookup failed", profileError);

      return jsonResponse(
        {
          success: false,
          error: "Impossible de vérifier le profil administrateur.",
        },
        500,
      );
    }

    if (
      !adminProfile ||
      adminProfile.role !== "admin" ||
      adminProfile.active !== true
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Accès administrateur requis.",
        },
        403,
      );
    }

    /*
     * 3. Validate the request.
     */
    let body: InviteTeacherRequest;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Corps de requête JSON invalide.",
        },
        400,
      );
    }

    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;

    if (!fullName) {
      return jsonResponse(
        {
          success: false,
          error: "Le nom est obligatoire.",
        },
        400,
      );
    }

    if (!email) {
      return jsonResponse(
        {
          success: false,
          error: "L'e-mail est obligatoire.",
        },
        400,
      );
    }

    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!emailIsValid) {
      return jsonResponse(
        {
          success: false,
          error: "L'e-mail fourni est invalide.",
        },
        400,
      );
    }

    /*
     * 4. Prevent duplicate EDUSA profiles.
     */
    const { data: existingProfile, error: existingProfileError } =
      await adminClient
        .from("profiles")
        .select("id, school_id, role, active")
        .eq("email", email)
        .maybeSingle();

    if (existingProfileError) {
      console.error(
        "[invite-teacher] Existing profile lookup failed",
        existingProfileError,
      );

      return jsonResponse(
        {
          success: false,
          error: "Impossible de vérifier l'e-mail.",
        },
        500,
      );
    }

    if (existingProfile) {
      return jsonResponse(
        {
          success: false,
          error: "Un utilisateur EDUSA utilise déjà cette adresse e-mail.",
        },
        409,
      );
    }

    /*
     * 5. Invite the Auth user.
     *
     * IMPORTANT:
     * This operation requires the server-side service-role key.
     */
    const redirectTo = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/callback`;

    const {
      data: invitedUser,
      error: inviteError,
    } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role: "teacher",
        school_id: adminProfile.school_id,
      },
      redirectTo,
    });

    if (inviteError || !invitedUser.user) {
      console.error("[invite-teacher] Auth invitation failed", inviteError);

      return jsonResponse(
        {
          success: false,
          error:
            inviteError?.message ||
            "Impossible d'envoyer l'invitation au professeur.",
        },
        400,
      );
    }

    const authUserId = invitedUser.user.id;

    /*
     * 6. Create the EDUSA profile.
     */
    const { error: profileInsertError } = await adminClient
      .from("profiles")
      .insert({
        id: authUserId,
        school_id: adminProfile.school_id,
        role: "teacher",
        full_name: fullName,
        phone,
        email,
        active: true,
      });

    if (profileInsertError) {
      console.error(
        "[invite-teacher] Profile creation failed",
        profileInsertError,
      );

      /*
       * Roll back the Auth user so we don't leave an orphaned account.
       */
      const { error: rollbackError } =
        await adminClient.auth.admin.deleteUser(authUserId);

      if (rollbackError) {
        console.error(
          "[invite-teacher] Auth rollback failed",
          rollbackError,
        );
      }

      return jsonResponse(
        {
          success: false,
          error: "Impossible de créer le profil enseignant.",
        },
        500,
      );
    }

    /*
     * 7. Create the teacher record.
     *
     * employee_number is intentionally null because the database
     * allows it to be null.
     */
    const { data: teacher, error: teacherInsertError } = await adminClient
      .from("teachers")
      .insert({
        profile_id: authUserId,
        school_id: adminProfile.school_id,
        employee_number: null,
        active: true,
      })
      .select("id, profile_id, school_id, employee_number, active")
      .single();

    if (teacherInsertError || !teacher) {
      console.error(
        "[invite-teacher] Teacher creation failed",
        teacherInsertError,
      );

      /*
       * Clean up the EDUSA profile first.
       */
      const { error: profileRollbackError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", authUserId);

      if (profileRollbackError) {
        console.error(
          "[invite-teacher] Profile rollback failed",
          profileRollbackError,
        );
      }

      /*
       * Then remove the Auth user.
       */
      const { error: authRollbackError } =
        await adminClient.auth.admin.deleteUser(authUserId);

      if (authRollbackError) {
        console.error(
          "[invite-teacher] Auth rollback failed",
          authRollbackError,
        );
      }

      return jsonResponse(
        {
          success: false,
          error: "Impossible de créer le compte enseignant.",
        },
        500,
      );
    }

    /*
     * 8. Return the real teacher ID.
     */
    return jsonResponse({
      success: true,
      teacher: {
        id: teacher.id,
        profile_id: teacher.profile_id,
        school_id: teacher.school_id,
        employee_number: teacher.employee_number,
        active: teacher.active,
        full_name: fullName,
        email,
        phone,
      },
      message: "Invitation enseignant envoyée avec succès.",
    });
  } catch (error) {
    console.error("[invite-teacher] Unexpected error", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Une erreur inattendue est survenue.",
      },
      500,
    );
  }
});