import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const missingEnvVars: string[] = [];

if (!supabaseUrl) {
missingEnvVars.push('VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
missingEnvVars.push('VITE_SUPABASE_ANON_KEY');
}

if (missingEnvVars.length > 0) {
console.error(
`[EDUSA Auth] Missing Supabase environment variables: ${missingEnvVars.join(
      ', ',
    )}. Create a .env.local file at the project root with these values.`,
);
}

/**

* Diagnostic environment check.
*
* IMPORTANT:
* Never log the Supabase anon key itself.
  */


export const isSupabaseConfigured = Boolean(
supabaseUrl && supabaseAnonKey,
);

/**

* Supabase client.
*
* The placeholder values preserve the existing demo/fallback behavior
* when Supabase environment variables are not configured.
  */
  export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  );
