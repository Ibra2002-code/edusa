export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string
          name: string
          country: string | null
          city: string | null
          phone: string | null
          email: string | null
          logo_url: string | null
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; name: string; country?: string | null; city?: string | null; phone?: string | null; email?: string | null; logo_url?: string | null; timezone?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; country?: string | null; city?: string | null; phone?: string | null; email?: string | null; logo_url?: string | null; timezone?: string; created_at?: string; updated_at?: string }
      }
      profiles: {
        Row: {
          id: string
          school_id: string
          role: 'admin' | 'teacher'
          full_name: string
          phone: string | null
          email: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: { id: string; school_id: string; role: 'admin' | 'teacher'; full_name: string; phone?: string | null; email?: string | null; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; school_id?: string; role?: 'admin' | 'teacher'; full_name?: string; phone?: string | null; email?: string | null; active?: boolean; created_at?: string; updated_at?: string }
      }
      teachers: {
        Row: {
          id: string
          profile_id: string
          school_id: string
          employee_number: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; profile_id: string; school_id: string; employee_number?: string | null; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; profile_id?: string; school_id?: string; employee_number?: string | null; active?: boolean; created_at?: string; updated_at?: string }
      }
      classes: {
        Row: {
          id: string
          school_id: string
          name: string
          level: string | null
          academic_year: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; school_id: string; name: string; level?: string | null; academic_year?: string | null; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; school_id?: string; name?: string; level?: string | null; academic_year?: string | null; active?: boolean; created_at?: string; updated_at?: string }
      }
      teacher_classes: {
        Row: { teacher_id: string; class_id: string; created_at: string }
        Insert: { teacher_id: string; class_id: string; created_at?: string }
        Update: { teacher_id?: string; class_id?: string; created_at?: string }
      }
      parents: {
        Row: {
          id: string
          school_id: string
          full_name: string
          whatsapp_number: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; school_id: string; full_name: string; whatsapp_number?: string | null; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; school_id?: string; full_name?: string; whatsapp_number?: string | null; active?: boolean; created_at?: string; updated_at?: string }
      }
      students: {
        Row: {
          id: string
          school_id: string
          class_id: string
          parent_id: string | null
          student_number: string | null
          first_name: string
          last_name: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; school_id: string; class_id: string; parent_id?: string | null; student_number?: string | null; first_name: string; last_name?: string | null; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; school_id?: string; class_id?: string; parent_id?: string | null; student_number?: string | null; first_name?: string; last_name?: string | null; active?: boolean; created_at?: string; updated_at?: string }
      }
      // Tables de présence
      attendance_sessions: {
        Row: {
          id: string
          school_id: string
          class_id: string
          teacher_id: string
          date: string
          started_at: string | null
          submitted_at: string | null
          status: 'draft' | 'submitted'
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          class_id: string
          teacher_id: string
          date: string
          started_at?: string | null
          submitted_at?: string | null
          status?: 'draft' | 'submitted'
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          class_id?: string
          teacher_id?: string
          date?: string
          started_at?: string | null
          submitted_at?: string | null
          status?: 'draft' | 'submitted'
          created_at?: string
        }
      }
      attendance_records: {
        Row: {
          id: string
          session_id: string
          student_id: string
          status: 'present' | 'absent'
          marked_at: string
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          student_id: string
          status: 'present' | 'absent'
          marked_at?: string
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          student_id?: string
          status?: 'present' | 'absent'
          marked_at?: string
          notified_at?: string | null
          created_at?: string
        }
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}