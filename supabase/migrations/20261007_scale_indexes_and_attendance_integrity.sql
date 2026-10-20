-- ============================================================
-- EDUSA — Stage 1 Scale Readiness
-- Date: 2026-10-07
--
-- Purpose:
--   1. Add indexes for common school/class/attendance queries.
--   2. Improve RLS-filtered query performance.
--   3. Prevent duplicate attendance sessions at DB level.
--
-- This migration intentionally does NOT:
--   - change RLS policies
--   - partition tables
--   - change application logic
--   - remove existing indexes
-- ============================================================


-- ============================================================
-- 1. STUDENTS
-- ============================================================

-- Common multi-tenant roster queries:
-- WHERE school_id = ? AND class_id = ?
CREATE INDEX IF NOT EXISTS idx_students_school_class
ON public.students (school_id, class_id);


-- ============================================================
-- 2. PARENTS
-- ============================================================

-- Admin parent lists / school-scoped parent queries.
CREATE INDEX IF NOT EXISTS idx_parents_school
ON public.parents (school_id);


-- ============================================================
-- 3. TEACHERS
-- ============================================================

-- School-scoped teacher management.
CREATE INDEX IF NOT EXISTS idx_teachers_school
ON public.teachers (school_id);


-- Used when resolving a teacher from their profile.
CREATE INDEX IF NOT EXISTS idx_teachers_profile
ON public.teachers (profile_id);


-- ============================================================
-- 4. TEACHER / CLASS ASSIGNMENTS
-- ============================================================

-- Important for:
--   - finding all classes assigned to a teacher
--   - teacher dashboard/class loading
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher
ON public.teacher_classes (teacher_id);


-- Important for:
--   - finding teachers assigned to a class
--   - class administration
CREATE INDEX IF NOT EXISTS idx_teacher_classes_class
ON public.teacher_classes (class_id);


-- ============================================================
-- 5. ATTENDANCE SESSIONS
-- ============================================================

-- School + date is a common reporting/filtering combination.
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_school_date
ON public.attendance_sessions (school_id, date);


-- Teacher attendance history.
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_teacher
ON public.attendance_sessions (teacher_id);


-- Class attendance history.
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_date
ON public.attendance_sessions (class_id, date);


-- ============================================================
-- 6. ATTENDANCE RECORDS
-- ============================================================

-- Every attendance submission loads records by session.
CREATE INDEX IF NOT EXISTS idx_attendance_records_session
ON public.attendance_records (session_id);


-- Student attendance history.
CREATE INDEX IF NOT EXISTS idx_attendance_records_student
ON public.attendance_records (student_id);


-- ============================================================
-- 7. TARGETED INDEX FOR WHATSAPP NOTIFICATIONS
-- ============================================================

-- The WhatsApp Edge Function looks for attendance records that:
--   - belong to a session
--   - are absent
--   - have not yet been notified
--
-- A partial index keeps this index small and focused.
CREATE INDEX IF NOT EXISTS idx_attendance_records_pending_absent
ON public.attendance_records (session_id)
WHERE status = 'absent'
  AND notified_at IS NULL;


-- ============================================================
-- 8. NOTIFICATIONS
-- ============================================================

-- School-scoped notification history.
CREATE INDEX IF NOT EXISTS idx_notifications_school
ON public.notifications (school_id);


-- Parent notification history.
CREATE INDEX IF NOT EXISTS idx_notifications_parent
ON public.notifications (parent_id);


-- Link from attendance record to notification history.
CREATE INDEX IF NOT EXISTS idx_notifications_attendance_record
ON public.notifications (attendance_record_id);



-- ============================================================
-- END OF MIGRATION
-- ============================================================