


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."current_teacher_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.id
  from public.teachers t
  join public.profiles p
    on p.id = t.profile_id
  where p.id = auth.uid()
    and p.role = 'teacher'
    and p.active = true
    and t.active = true
  limit 1;
$$;


ALTER FUNCTION "public"."current_teacher_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_school_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
select school_id
from public.profiles
where id = auth.uid()
and active = true
limit 1;

$$;


ALTER FUNCTION "public"."current_user_school_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active = true
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_teacher"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    join public.teachers t
      on t.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'teacher'
      and p.active = true
      and t.active = true
  );
$$;


ALTER FUNCTION "public"."is_teacher"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teacher_has_class"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_classes tc
    WHERE tc.teacher_id = public.current_teacher_id()
      AND tc.class_id = p_class_id
  );
$$;


ALTER FUNCTION "public"."teacher_has_class"("p_class_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "marked_at" timestamp with time zone DEFAULT "now"(),
    "notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "attendance_records_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text"])))
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "submitted_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "attendance_sessions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text"])))
);


ALTER TABLE "public"."attendance_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "level" "text",
    "academic_year" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "language" "text" DEFAULT 'fr'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "attendance_record_id" "uuid" NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_message_id" "text",
    "message_preview" "text",
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "whatsapp_number" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "country" "text" DEFAULT 'Djibouti'::"text",
    "city" "text",
    "phone" "text",
    "email" "text",
    "logo_url" "text",
    "timezone" "text" DEFAULT 'Africa/Djibouti'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "academic_year" "text"
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "student_number" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "middle_name" "text"
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_classes" (
    "teacher_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teacher_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "employee_number" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teachers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_classes"
    ADD CONSTRAINT "teacher_classes_pkey" PRIMARY KEY ("teacher_id", "class_id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_attendance_sessions_date" ON "public"."attendance_sessions" USING "btree" ("date");



CREATE INDEX "idx_classes_school" ON "public"."classes" USING "btree" ("school_id");



CREATE INDEX "idx_notifications_status" ON "public"."notifications" USING "btree" ("status");



CREATE INDEX "idx_profiles_school" ON "public"."profiles" USING "btree" ("school_id");



CREATE INDEX "idx_students_class" ON "public"."students" USING "btree" ("class_id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."teacher_classes"
    ADD CONSTRAINT "teacher_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_classes"
    ADD CONSTRAINT "teacher_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_records_admin_delete" ON "public"."attendance_records" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "attendance_records_admin_insert" ON "public"."attendance_records" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."school_id" = "public"."current_user_school_id"())))) AND (EXISTS ( SELECT 1
   FROM ("public"."attendance_sessions" "s"
     JOIN "public"."students" "st" ON (("st"."class_id" = "s"."class_id")))
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("st"."id" = "attendance_records"."student_id") AND ("st"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "attendance_records_admin_select" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "attendance_records_admin_update" ON "public"."attendance_records" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."school_id" = "public"."current_user_school_id"())))))) WITH CHECK (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "attendance_records_teacher_insert" ON "public"."attendance_records" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_teacher"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."teacher_id" = "public"."current_teacher_id"()) AND ("s"."school_id" = "public"."current_user_school_id"())))) AND (EXISTS ( SELECT 1
   FROM ("public"."attendance_sessions" "s"
     JOIN "public"."students" "st" ON (("st"."class_id" = "s"."class_id")))
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("st"."id" = "attendance_records"."student_id") AND ("st"."school_id" = "public"."current_user_school_id"()) AND ("st"."active" = true))))));



CREATE POLICY "attendance_records_teacher_select" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING (("public"."is_teacher"() AND (EXISTS ( SELECT 1
   FROM "public"."attendance_sessions" "s"
  WHERE (("s"."id" = "attendance_records"."session_id") AND ("s"."teacher_id" = "public"."current_teacher_id"()) AND ("s"."school_id" = "public"."current_user_school_id"()))))));



ALTER TABLE "public"."attendance_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_sessions_admin_delete" ON "public"."attendance_sessions" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "attendance_sessions_admin_insert" ON "public"."attendance_sessions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "attendance_sessions"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"())))) AND (EXISTS ( SELECT 1
   FROM "public"."teachers" "t"
  WHERE (("t"."id" = "attendance_sessions"."teacher_id") AND ("t"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "attendance_sessions_admin_select" ON "public"."attendance_sessions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "attendance_sessions_admin_update" ON "public"."attendance_sessions" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "attendance_sessions_teacher_insert" ON "public"."attendance_sessions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_teacher"() AND ("teacher_id" = "public"."current_teacher_id"()) AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "attendance_sessions"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"()) AND ("c"."active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."teacher_classes" "tc"
  WHERE (("tc"."teacher_id" = "public"."current_teacher_id"()) AND ("tc"."class_id" = "attendance_sessions"."class_id"))))));



CREATE POLICY "attendance_sessions_teacher_select" ON "public"."attendance_sessions" FOR SELECT TO "authenticated" USING (("public"."is_teacher"() AND ("teacher_id" = "public"."current_teacher_id"()) AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "attendance_sessions_teacher_update" ON "public"."attendance_sessions" FOR UPDATE TO "authenticated" USING (("public"."is_teacher"() AND ("teacher_id" = "public"."current_teacher_id"()) AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_teacher"() AND ("teacher_id" = "public"."current_teacher_id"()) AND ("school_id" = "public"."current_user_school_id"())));



ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_admin_delete" ON "public"."classes" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "classes_admin_insert" ON "public"."classes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "classes_admin_select" ON "public"."classes" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "classes_admin_update" ON "public"."classes" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_templates_admin_delete" ON "public"."notification_templates" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "notification_templates_admin_insert" ON "public"."notification_templates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "notification_templates_admin_select" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "notification_templates_admin_update" ON "public"."notification_templates" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "notifications_admin_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "notifications_admin_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



ALTER TABLE "public"."parents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parents_admin_delete" ON "public"."parents" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "parents_admin_insert" ON "public"."parents" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "parents_admin_select" ON "public"."parents" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "parents_admin_update" ON "public"."parents" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "profiles_admin_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "profiles_admin_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "profiles_admin_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "profiles_own_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schools_admin_update" ON "public"."schools" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("id" = "public"."current_user_school_id"())));



CREATE POLICY "schools_own_select" ON "public"."schools" FOR SELECT TO "authenticated" USING (("id" = "public"."current_user_school_id"()));



ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "students_admin_delete" ON "public"."students" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "students_admin_insert" ON "public"."students" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "students"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"())))) AND (("parent_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."id" = "students"."parent_id") AND ("p"."school_id" = "public"."current_user_school_id"())))))));



CREATE POLICY "students_admin_select" ON "public"."students" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "students_admin_update" ON "public"."students" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "students"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"())))) AND (("parent_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."id" = "students"."parent_id") AND ("p"."school_id" = "public"."current_user_school_id"())))))));



CREATE POLICY "students_teacher_select" ON "public"."students" FOR SELECT TO "authenticated" USING (("public"."is_teacher"() AND ("active" = true) AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."teacher_classes" "tc"
  WHERE (("tc"."teacher_id" = "public"."current_teacher_id"()) AND ("tc"."class_id" = "students"."class_id"))))));



ALTER TABLE "public"."teacher_classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teacher_classes_admin_delete" ON "public"."teacher_classes" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."teachers" "t"
  WHERE (("t"."id" = "teacher_classes"."teacher_id") AND ("t"."school_id" = "public"."current_user_school_id"())))) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "teacher_classes"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "teacher_classes_admin_insert" ON "public"."teacher_classes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."teachers" "t"
  WHERE (("t"."id" = "teacher_classes"."teacher_id") AND ("t"."school_id" = "public"."current_user_school_id"()) AND ("t"."active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "teacher_classes"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"()) AND ("c"."active" = true))))));



CREATE POLICY "teacher_classes_admin_select" ON "public"."teacher_classes" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."teachers" "t"
  WHERE (("t"."id" = "teacher_classes"."teacher_id") AND ("t"."school_id" = "public"."current_user_school_id"())))) AND (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "teacher_classes"."class_id") AND ("c"."school_id" = "public"."current_user_school_id"()))))));



CREATE POLICY "teacher_classes_teacher_select" ON "public"."teacher_classes" FOR SELECT TO "authenticated" USING (("public"."is_teacher"() AND ("teacher_id" = "public"."current_teacher_id"())));



ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teachers_admin_delete" ON "public"."teachers" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "teachers_admin_insert" ON "public"."teachers" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "teachers"."profile_id") AND ("p"."school_id" = "public"."current_user_school_id"()) AND ("p"."role" = 'teacher'::"text") AND ("p"."active" = true))))));



CREATE POLICY "teachers_admin_select" ON "public"."teachers" FOR SELECT TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"())));



CREATE POLICY "teachers_admin_update" ON "public"."teachers" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()))) WITH CHECK (("public"."is_admin"() AND ("school_id" = "public"."current_user_school_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "teachers"."profile_id") AND ("p"."school_id" = "public"."current_user_school_id"()) AND ("p"."role" = 'teacher'::"text"))))));



CREATE POLICY "teachers_own_select" ON "public"."teachers" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND ("school_id" = "public"."current_user_school_id"())));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."current_teacher_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_teacher_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_teacher_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_school_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_school_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_school_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_teacher"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_teacher"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_teacher"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."teacher_has_class"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."teacher_has_class"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."teacher_has_class"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_has_class"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_sessions" TO "anon";
GRANT ALL ON TABLE "public"."attendance_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."parents" TO "anon";
GRANT ALL ON TABLE "public"."parents" TO "authenticated";
GRANT ALL ON TABLE "public"."parents" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_classes" TO "anon";
GRANT ALL ON TABLE "public"."teacher_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_classes" TO "service_role";



GRANT ALL ON TABLE "public"."teachers" TO "anon";
GRANT ALL ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







