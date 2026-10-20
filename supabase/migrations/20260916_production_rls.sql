-- ============================================================
-- EDUSA - Production Row Level Security
-- Migration: 20260916_production_rls.sql
-----------------------------------------

-- Roles:
--   admin   = complex-management role
--   teacher = attendance-only operational role
-----------------------------------------------

-- Security goals:
--   - Every school is isolated from every other school.
--   - Teachers only access their assigned classes/students.
--   - Teachers cannot access parent management.
--   - Teachers cannot modify attendance records after insertion.
--   - Admins manage their own school's operational data.
--   - Cross-school relationships are explicitly prevented.
-- ============================================================

-- ============================================================
-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================

create or replace function public.current_user_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
select school_id
from public.profiles
where id = auth.uid()
and active = true
limit 1;

$$;


create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active = true
  );
$$;


create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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


create or replace function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
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


grant execute on function public.current_user_school_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.current_teacher_id() to authenticated;


-- ============================================================
-- 2. ENABLE RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.students enable row level security;
alter table public.parents enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_templates enable row level security;


-- ============================================================
-- 3. REMOVE EXISTING APPLICATION POLICIES
-- ============================================================

drop policy if exists "Teachers can create attendance sessions"
  on public.attendance_sessions;

drop policy if exists "Teachers can insert attendance records"
  on public.attendance_records;

drop policy if exists "Teachers can view assigned classes"
  on public.classes;

drop policy if exists "Teachers can view assigned classes"
  on public.teacher_classes;

drop policy if exists "Teachers can view own attendance sessions"
  on public.attendance_sessions;

drop policy if exists "Teachers can view own record"
  on public.teachers;

drop policy if exists "Teachers can view students in assigned classes"
  on public.students;

drop policy if exists "Users can view own school"
  on public.schools;

drop policy if exists "Users can view their own profile"
  on public.profiles;

drop policy if exists "teacher_view_own_classes"
  on public.teacher_classes;


-- Remove migration policies if this migration is ever re-created
-- or repaired and re-applied manually.

drop policy if exists "profiles_own_select"
  on public.profiles;

drop policy if exists "profiles_admin_select"
  on public.profiles;

drop policy if exists "profiles_admin_insert"
  on public.profiles;

drop policy if exists "profiles_admin_update"
  on public.profiles;

drop policy if exists "profiles_admin_delete"
  on public.profiles;

drop policy if exists "schools_own_select"
  on public.schools;

drop policy if exists "schools_admin_update"
  on public.schools;

drop policy if exists "teachers_own_select"
  on public.teachers;

drop policy if exists "teachers_admin_select"
  on public.teachers;

drop policy if exists "teachers_admin_insert"
  on public.teachers;

drop policy if exists "teachers_admin_update"
  on public.teachers;

drop policy if exists "teachers_admin_delete"
  on public.teachers;

drop policy if exists "classes_teacher_select"
  on public.classes;

drop policy if exists "classes_admin_select"
  on public.classes;

drop policy if exists "classes_admin_insert"
  on public.classes;

drop policy if exists "classes_admin_update"
  on public.classes;

drop policy if exists "classes_admin_delete"
  on public.classes;

drop policy if exists "teacher_classes_teacher_select"
  on public.teacher_classes;

drop policy if exists "teacher_classes_admin_select"
  on public.teacher_classes;

drop policy if exists "teacher_classes_admin_insert"
  on public.teacher_classes;

drop policy if exists "teacher_classes_admin_delete"
  on public.teacher_classes;

drop policy if exists "students_teacher_select"
  on public.students;

drop policy if exists "students_admin_select"
  on public.students;

drop policy if exists "students_admin_insert"
  on public.students;

drop policy if exists "students_admin_update"
  on public.students;

drop policy if exists "students_admin_delete"
  on public.students;

drop policy if exists "parents_admin_select"
  on public.parents;

drop policy if exists "parents_admin_insert"
  on public.parents;

drop policy if exists "parents_admin_update"
  on public.parents;

drop policy if exists "parents_admin_delete"
  on public.parents;

drop policy if exists "attendance_sessions_teacher_select"
  on public.attendance_sessions;

drop policy if exists "attendance_sessions_admin_select"
  on public.attendance_sessions;

drop policy if exists "attendance_sessions_teacher_insert"
  on public.attendance_sessions;

drop policy if exists "attendance_sessions_teacher_update"
  on public.attendance_sessions;

drop policy if exists "attendance_sessions_admin_insert"
  on public.attendance_sessions;

drop policy if exists "attendance_sessions_admin_update"
  on public.attendance_sessions;

drop policy if exists "attendance_sessions_admin_delete"
  on public.attendance_sessions;

drop policy if exists "attendance_records_teacher_select"
  on public.attendance_records;

drop policy if exists "attendance_records_admin_select"
  on public.attendance_records;

drop policy if exists "attendance_records_teacher_insert"
  on public.attendance_records;

drop policy if exists "attendance_records_admin_insert"
  on public.attendance_records;

drop policy if exists "attendance_records_admin_update"
  on public.attendance_records;

drop policy if exists "attendance_records_admin_delete"
  on public.attendance_records;

drop policy if exists "notifications_admin_select"
  on public.notifications;

drop policy if exists "notifications_admin_update"
  on public.notifications;

drop policy if exists "notifications_admin_delete"
  on public.notifications;

drop policy if exists "notification_templates_admin_select"
  on public.notification_templates;

drop policy if exists "notification_templates_admin_insert"
  on public.notification_templates;

drop policy if exists "notification_templates_admin_update"
  on public.notification_templates;

drop policy if exists "notification_templates_admin_delete"
  on public.notification_templates;


-- ============================================================
-- 4. PROFILES
-- ============================================================

create policy "profiles_own_select"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);


create policy "profiles_admin_select"
on public.profiles
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "profiles_admin_insert"
on public.profiles
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "profiles_admin_delete"
on public.profiles
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 5. SCHOOLS
-- ============================================================

create policy "schools_own_select"
on public.schools
for select
to authenticated
using (
  id = public.current_user_school_id()
);


create policy "schools_admin_update"
on public.schools
for update
to authenticated
using (
  public.is_admin()
  and id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and id = public.current_user_school_id()
);


-- ============================================================
-- 6. TEACHERS
-- ============================================================

create policy "teachers_own_select"
on public.teachers
for select
to authenticated
using (
  profile_id = auth.uid()
  and school_id = public.current_user_school_id()
);


create policy "teachers_admin_select"
on public.teachers
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "teachers_admin_insert"
on public.teachers
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.school_id = public.current_user_school_id()
      and p.role = 'teacher'
      and p.active = true
  )
);


create policy "teachers_admin_update"
on public.teachers
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.school_id = public.current_user_school_id()
      and p.role = 'teacher'
  )
);


create policy "teachers_admin_delete"
on public.teachers
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 7. CLASSES
-- ============================================================

create policy "classes_teacher_select"
on public.classes
for select
to authenticated
using (
  public.is_teacher()
  and active = true
  and school_id = public.current_user_school_id()
  and exists (
    select 1
    from public.teacher_classes tc
    where tc.teacher_id = public.current_teacher_id()
      and tc.class_id = classes.id
  )
);


create policy "classes_admin_select"
on public.classes
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "classes_admin_insert"
on public.classes
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "classes_admin_update"
on public.classes
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "classes_admin_delete"
on public.classes
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 8. TEACHER / CLASS ASSIGNMENTS
-- ============================================================

create policy "teacher_classes_teacher_select"
on public.teacher_classes
for select
to authenticated
using (
  public.is_teacher()
  and teacher_id = public.current_teacher_id()
);


create policy "teacher_classes_admin_select"
on public.teacher_classes
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.teachers t
    where t.id = teacher_classes.teacher_id
      and t.school_id = public.current_user_school_id()
  )
  and exists (
    select 1
    from public.classes c
    where c.id = teacher_classes.class_id
      and c.school_id = public.current_user_school_id()
  )
);


create policy "teacher_classes_admin_insert"
on public.teacher_classes
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.teachers t
    where t.id = teacher_classes.teacher_id
      and t.school_id = public.current_user_school_id()
      and t.active = true
  )
  and exists (
    select 1
    from public.classes c
    where c.id = teacher_classes.class_id
      and c.school_id = public.current_user_school_id()
      and c.active = true
  )
);


create policy "teacher_classes_admin_delete"
on public.teacher_classes
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.teachers t
    where t.id = teacher_classes.teacher_id
      and t.school_id = public.current_user_school_id()
  )
  and exists (
    select 1
    from public.classes c
    where c.id = teacher_classes.class_id
      and c.school_id = public.current_user_school_id()
  )
);


-- ============================================================
-- 9. STUDENTS
-- ============================================================

create policy "students_teacher_select"
on public.students
for select
to authenticated
using (
  public.is_teacher()
  and active = true
  and school_id = public.current_user_school_id()
  and exists (
    select 1
    from public.teacher_classes tc
    where tc.teacher_id = public.current_teacher_id()
      and tc.class_id = students.class_id
  )
);


create policy "students_admin_select"
on public.students
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "students_admin_insert"
on public.students
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()

  -- Class must belong to the same school.
  and exists (
    select 1
    from public.classes c
    where c.id = students.class_id
      and c.school_id = public.current_user_school_id()
  )

  -- Parent must either be NULL or belong to the same school.
  and (
    parent_id is null
    or exists (
      select 1
      from public.parents p
      where p.id = students.parent_id
        and p.school_id = public.current_user_school_id()
    )
  )
);


create policy "students_admin_update"
on public.students
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()

  -- Class must belong to the same school.
  and exists (
    select 1
    from public.classes c
    where c.id = students.class_id
      and c.school_id = public.current_user_school_id()
  )

  -- Parent must either be NULL or belong to the same school.
  and (
    parent_id is null
    or exists (
      select 1
      from public.parents p
      where p.id = students.parent_id
        and p.school_id = public.current_user_school_id()
    )
  )
);


create policy "students_admin_delete"
on public.students
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 10. PARENTS
--
-- Parents are intentionally NOT accessible to teachers.
-- ============================================================

create policy "parents_admin_select"
on public.parents
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "parents_admin_insert"
on public.parents
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "parents_admin_update"
on public.parents
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "parents_admin_delete"
on public.parents
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 11. ATTENDANCE SESSIONS
-- ============================================================

-- Teacher can see only their own attendance sessions.
create policy "attendance_sessions_teacher_select"
on public.attendance_sessions
for select
to authenticated
using (
  public.is_teacher()
  and teacher_id = public.current_teacher_id()
  and school_id = public.current_user_school_id()
);


-- Admin can see sessions belonging to their school.
create policy "attendance_sessions_admin_select"
on public.attendance_sessions
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- Teacher creates a session only for an assigned class.
create policy "attendance_sessions_teacher_insert"
on public.attendance_sessions
for insert
to authenticated
with check (
  public.is_teacher()
  and teacher_id = public.current_teacher_id()
  and school_id = public.current_user_school_id()
  and exists (
    select 1
    from public.classes c
    where c.id = attendance_sessions.class_id
      and c.school_id = public.current_user_school_id()
      and c.active = true
  )
  and exists (
    select 1
    from public.teacher_classes tc
    where tc.teacher_id = public.current_teacher_id()
      and tc.class_id = attendance_sessions.class_id
  )
);


-- Admin can create attendance sessions for their school.
-- The selected teacher must belong to the same school.
create policy "attendance_sessions_admin_insert"
on public.attendance_sessions
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
  and exists (
    select 1
    from public.classes c
    where c.id = attendance_sessions.class_id
      and c.school_id = public.current_user_school_id()
  )
  and exists (
    select 1
    from public.teachers t
    where t.id = attendance_sessions.teacher_id
      and t.school_id = public.current_user_school_id()
  )
);


-- Teacher can update only their own sessions.
-- This supports the application's draft -> submitted flow.
create policy "attendance_sessions_teacher_update"
on public.attendance_sessions
for update
to authenticated
using (
  public.is_teacher()
  and teacher_id = public.current_teacher_id()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_teacher()
  and teacher_id = public.current_teacher_id()
  and school_id = public.current_user_school_id()
);


create policy "attendance_sessions_admin_update"
on public.attendance_sessions
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "attendance_sessions_admin_delete"
on public.attendance_sessions
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 12. ATTENDANCE RECORDS
-- ============================================================

-- Teacher can see records belonging to their own sessions.
create policy "attendance_records_teacher_select"
on public.attendance_records
for select
to authenticated
using (
  public.is_teacher()
  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.teacher_id = public.current_teacher_id()
      and s.school_id = public.current_user_school_id()
  )
);


-- Admin can see all records belonging to their school.
create policy "attendance_records_admin_select"
on public.attendance_records
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.school_id = public.current_user_school_id()
  )
);


-- Teacher can INSERT attendance records only into their own
-- attendance session and only for a student in that session's class.
create policy "attendance_records_teacher_insert"
on public.attendance_records
for insert
to authenticated
with check (
  public.is_teacher()

  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.teacher_id = public.current_teacher_id()
      and s.school_id = public.current_user_school_id()
  )

  and exists (
    select 1
    from public.attendance_sessions s
    join public.students st
      on st.class_id = s.class_id
    where s.id = attendance_records.session_id
      and st.id = attendance_records.student_id
      and st.school_id = public.current_user_school_id()
      and st.active = true
  )
);


-- Admin can insert attendance records for their school.
create policy "attendance_records_admin_insert"
on public.attendance_records
for insert
to authenticated
with check (
  public.is_admin()

  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.school_id = public.current_user_school_id()
  )

  and exists (
    select 1
    from public.attendance_sessions s
    join public.students st
      on st.class_id = s.class_id
    where s.id = attendance_records.session_id
      and st.id = attendance_records.student_id
      and st.school_id = public.current_user_school_id()
  )
);


-- Admin can correct attendance records.
create policy "attendance_records_admin_update"
on public.attendance_records
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.school_id = public.current_user_school_id()
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.school_id = public.current_user_school_id()
  )
);


create policy "attendance_records_admin_delete"
on public.attendance_records
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = attendance_records.session_id
      and s.school_id = public.current_user_school_id()
  )
);


-- IMPORTANT:
-- There is intentionally NO teacher UPDATE policy here.
--
-- Teachers can:
--   INSERT attendance
--   SELECT attendance
--
-- They cannot directly change:
--   status
--   student_id
--   session_id
--   notified_at
--
-- This protects the notification/idempotency workflow.


-- ============================================================
-- 13. NOTIFICATIONS
--
-- Teachers do not have access to notification records.
-- The Edge Function uses service_role and therefore bypasses RLS.
-- Admins can inspect and manage notification history.
-- ============================================================

create policy "notifications_admin_select"
on public.notifications
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "notifications_admin_update"
on public.notifications
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "notifications_admin_delete"
on public.notifications
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 14. NOTIFICATION TEMPLATES
-- ============================================================

create policy "notification_templates_admin_select"
on public.notification_templates
for select
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "notification_templates_admin_insert"
on public.notification_templates
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "notification_templates_admin_update"
on public.notification_templates
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


create policy "notification_templates_admin_delete"
on public.notification_templates
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);


-- ============================================================
-- 15. FINAL SECURITY STATE
-- ============================================================
--
-- ADMIN:
--   profiles              SELECT/INSERT/UPDATE/DELETE
--   schools               SELECT/UPDATE own school
--   teachers              SELECT/INSERT/UPDATE/DELETE
--   classes               SELECT/INSERT/UPDATE/DELETE
--   teacher_classes       SELECT/INSERT/DELETE
--   students              SELECT/INSERT/UPDATE/DELETE
--   parents               SELECT/INSERT/UPDATE/DELETE
--   attendance_sessions   SELECT/INSERT/UPDATE/DELETE
--   attendance_records    SELECT/INSERT/UPDATE/DELETE
--   notifications         SELECT/UPDATE/DELETE
--   notification_templates SELECT/INSERT/UPDATE/DELETE
--
-- TEACHER:
--   own teacher record    SELECT
--   assigned classes      SELECT
--   own assignments       SELECT
--   assigned students     SELECT
--   own attendance        SELECT
--   attendance sessions   INSERT/UPDATE own
--   attendance records    INSERT/SELECT own sessions
--
-- TEACHER CANNOT:
--   manage students
--   manage parents
--   manage teachers
--   assign teachers
--   create classes
--   manage notification templates
--   access notification records
--   update attendance records after insertion
--   access another school's data
--
-- EDGE FUNCTION:
--   send-attendance-whatsapp uses service_role
--   and therefore bypasses RLS for notification delivery.
--
-- ============================================================
-- END OF MIGRATION
-- ============================================================

