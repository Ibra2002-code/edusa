import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const missingEnvVars: string[] = [];

if (!supabaseUrl) {
  missingEnvVars.push("VITE_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  missingEnvVars.push("VITE_SUPABASE_ANON_KEY");
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey,
);

if (!isSupabaseConfigured) {
  console.error(
    `[EDUSA Auth] Supabase is not configured. Missing environment variable(s): ${missingEnvVars.join(
      ", ",
    )}. Add them to your local .env.local file and to Vercel's Production environment variables.`,
  );
}

/**
 * Supabase client.
 *
 * The login page must check isSupabaseConfigured before attempting
 * authentication. Placeholder values prevent module initialization from
 * crashing unrelated pages, but they are not valid credentials and must
 * never be treated as a working authentication configuration.
 */
export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
);
