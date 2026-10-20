-- ============================================================
-- EDUSA — Stage 2 RLS Performance Optimization
-- Date: 2026-10-07
--
-- Purpose:
--   Optimize existing RLS policies without changing their
--   authorization rules.
--
-- Main optimization:
--   Wrap request-level helper functions in SELECT so PostgreSQL
--   can evaluate/cache them once per statement.
--
-- No tables, columns, permissions, or business rules are changed.
-- ============================================================


-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

ALTER POLICY "attendance_records_admin_delete"
ON public.attendance_records
USING (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "attendance_records_admin_insert"
ON public.attendance_records
WITH CHECK (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.school_id = (select public.current_user_school_id())
  )
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    JOIN public.students st
      ON st.class_id = s.class_id
    WHERE s.id = attendance_records.session_id
      AND st.id = attendance_records.student_id
      AND st.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "attendance_records_admin_select"
ON public.attendance_records
USING (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "attendance_records_admin_update"
ON public.attendance_records
USING (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.school_id = (select public.current_user_school_id())
  )
)
WITH CHECK (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "attendance_records_teacher_insert"
ON public.attendance_records
WITH CHECK (
  (select public.is_teacher())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.teacher_id = (select public.current_teacher_id())
      AND s.school_id = (select public.current_user_school_id())
  )
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    JOIN public.students st
      ON st.class_id = s.class_id
    WHERE s.id = attendance_records.session_id
      AND st.id = attendance_records.student_id
      AND st.school_id = (select public.current_user_school_id())
      AND st.active = true
  )
);


ALTER POLICY "attendance_records_teacher_select"
ON public.attendance_records
USING (
  (select public.is_teacher())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = attendance_records.session_id
      AND s.teacher_id = (select public.current_teacher_id())
      AND s.school_id = (select public.current_user_school_id())
  )
);


-- ============================================================
-- ATTENDANCE SESSIONS
-- ============================================================

ALTER POLICY "attendance_sessions_admin_delete"
ON public.attendance_sessions
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "attendance_sessions_admin_insert"
ON public.attendance_sessions
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = attendance_sessions.class_id
      AND c.school_id = (select public.current_user_school_id())
  )
  AND EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = attendance_sessions.teacher_id
      AND t.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "attendance_sessions_admin_select"
ON public.attendance_sessions
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "attendance_sessions_admin_update"
ON public.attendance_sessions
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "attendance_sessions_teacher_insert"
ON public.attendance_sessions
WITH CHECK (
  (select public.is_teacher())
  AND teacher_id = (select public.current_teacher_id())
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = attendance_sessions.class_id
      AND c.school_id = (select public.current_user_school_id())
      AND c.active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.teacher_classes tc
    WHERE tc.teacher_id = (select public.current_teacher_id())
      AND tc.class_id = attendance_sessions.class_id
  )
);


ALTER POLICY "attendance_sessions_teacher_select"
ON public.attendance_sessions
USING (
  (select public.is_teacher())
  AND teacher_id = (select public.current_teacher_id())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "attendance_sessions_teacher_update"
ON public.attendance_sessions
USING (
  (select public.is_teacher())
  AND teacher_id = (select public.current_teacher_id())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_teacher())
  AND teacher_id = (select public.current_teacher_id())
  AND school_id = (select public.current_user_school_id())
);


-- ============================================================
-- CLASSES
-- ============================================================

ALTER POLICY "classes_admin_delete"
ON public.classes
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "classes_admin_insert"
ON public.classes
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "classes_admin_select"
ON public.classes
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "classes_admin_update"
ON public.classes
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


-- ============================================================
-- NOTIFICATION TEMPLATES
-- ============================================================

ALTER POLICY "notification_templates_admin_delete"
ON public.notification_templates
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "notification_templates_admin_insert"
ON public.notification_templates
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "notification_templates_admin_select"
ON public.notification_templates
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "notification_templates_admin_update"
ON public.notification_templates
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================

ALTER POLICY "notifications_admin_delete"
ON public.notifications
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "notifications_admin_select"
ON public.notifications
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "notifications_admin_update"
ON public.notifications
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


-- ============================================================
-- PARENTS
-- ============================================================

ALTER POLICY "parents_admin_delete"
ON public.parents
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "parents_admin_insert"
ON public.parents
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "parents_admin_select"
ON public.parents
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "parents_admin_update"
ON public.parents
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


-- ============================================================
-- PROFILES
-- ============================================================

ALTER POLICY "profiles_admin_delete"
ON public.profiles
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "profiles_admin_insert"
ON public.profiles
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "profiles_admin_select"
ON public.profiles
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "profiles_admin_update"
ON public.profiles
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "profiles_own_select"
ON public.profiles
USING (
  id = (select auth.uid())
);


-- ============================================================
-- SCHOOLS
-- ============================================================

ALTER POLICY "schools_admin_update"
ON public.schools
USING (
  (select public.is_admin())
  AND id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND id = (select public.current_user_school_id())
);


ALTER POLICY "schools_own_select"
ON public.schools
USING (
  id = (select public.current_user_school_id())
);


-- ============================================================
-- STUDENTS
-- ============================================================

ALTER POLICY "students_admin_delete"
ON public.students
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "students_admin_insert"
ON public.students
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = students.class_id
      AND c.school_id = (select public.current_user_school_id())
  )
  AND (
    parent_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.parents p
      WHERE p.id = students.parent_id
        AND p.school_id = (select public.current_user_school_id())
    )
  )
);


ALTER POLICY "students_admin_select"
ON public.students
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "students_admin_update"
ON public.students
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = students.class_id
      AND c.school_id = (select public.current_user_school_id())
  )
  AND (
    parent_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.parents p
      WHERE p.id = students.parent_id
        AND p.school_id = (select public.current_user_school_id())
    )
  )
);


ALTER POLICY "students_teacher_select"
ON public.students
USING (
  (select public.is_teacher())
  AND active = true
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.teacher_classes tc
    WHERE tc.teacher_id = (select public.current_teacher_id())
      AND tc.class_id = students.class_id
  )
);


-- ============================================================
-- TEACHER / CLASS ASSIGNMENTS
-- ============================================================

ALTER POLICY "teacher_classes_admin_delete"
ON public.teacher_classes
USING (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = teacher_classes.teacher_id
      AND t.school_id = (select public.current_user_school_id())
  )
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = teacher_classes.class_id
      AND c.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "teacher_classes_admin_insert"
ON public.teacher_classes
WITH CHECK (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = teacher_classes.teacher_id
      AND t.school_id = (select public.current_user_school_id())
      AND t.active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = teacher_classes.class_id
      AND c.school_id = (select public.current_user_school_id())
      AND c.active = true
  )
);


ALTER POLICY "teacher_classes_admin_select"
ON public.teacher_classes
USING (
  (select public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = teacher_classes.teacher_id
      AND t.school_id = (select public.current_user_school_id())
  )
  AND EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = teacher_classes.class_id
      AND c.school_id = (select public.current_user_school_id())
  )
);


ALTER POLICY "teacher_classes_teacher_select"
ON public.teacher_classes
USING (
  (select public.is_teacher())
  AND teacher_id = (select public.current_teacher_id())
);


-- ============================================================
-- TEACHERS
-- ============================================================

ALTER POLICY "teachers_admin_delete"
ON public.teachers
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "teachers_admin_insert"
ON public.teachers
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = teachers.profile_id
      AND p.school_id = (select public.current_user_school_id())
      AND p.role = 'teacher'
      AND p.active = true
  )
);


ALTER POLICY "teachers_admin_select"
ON public.teachers
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
);


ALTER POLICY "teachers_admin_update"
ON public.teachers
USING (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
)
WITH CHECK (
  (select public.is_admin())
  AND school_id = (select public.current_user_school_id())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = teachers.profile_id
      AND p.school_id = (select public.current_user_school_id())
      AND p.role = 'teacher'
  )
);


ALTER POLICY "teachers_own_select"
ON public.teachers
USING (
  profile_id = (select auth.uid())
  AND school_id = (select public.current_user_school_id())
);


-- ============================================================
-- END OF STAGE 2
-- ============================================================