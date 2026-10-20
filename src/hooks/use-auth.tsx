import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { User } from '@supabase/supabase-js';

type Role = 'admin' | 'teacher' | null;
type ProfileRoleRow = Pick<
Database['public']['Tables']['profiles']['Row'],
'role'
>;
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface AuthContextType {
user: User | null;
profile: ProfileRow | null;
role: Role;
loading: boolean;
isDemo: boolean;
isAuthenticated: boolean;
signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {

const [user, setUser] = useState<User | null>(null);
const [profile, setProfile] = useState<ProfileRow | null>(null);
const [role, setRole] = useState<Role>(null);
const [loading, setLoading] = useState(true);
const [isDemo] = useState(!isSupabaseConfigured);

useEffect(() => {
if (!isSupabaseConfigured) {
setUser(null);
setProfile(null);
setRole(null);
setLoading(false);
return;
}


supabase.auth.getSession().then(({ data: { session }, error }) => {
  if (error) {
    console.error('[EDUSA AUTH] getSession failed', error);
    setUser(null);
    setProfile(null);
    setRole(null);
    setLoading(false);
    return;
  }

  if (session) {
    setLoading(true);
    setUser(session.user);
    void fetchProfile(session.user.id);
  } else {
    setUser(null);
    setProfile(null);
    setRole(null);
    setLoading(false);
  }
});

const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    setLoading(true);
    setUser(session.user);
    setProfile(null);
    setRole(null);
    void fetchProfile(session.user.id);
  } else {
    setUser(null);
    setProfile(null);
    setRole(null);
    setLoading(false);
  }
});

return () => subscription.unsubscribe();


}, []);

async function fetchProfile(userId: string) {
try {



  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();


  if (error) {
    console.error('[EDUSA AUTH] Profile query failed', error);
    throw error;
  }

  if (!data) {
    console.error('[EDUSA AUTH] Profile not found', {
      userId,
    });
  }

  setProfile(data ?? null);
  setRole((data?.role as Role) ?? null);
} catch (err) {
  console.error(
    '[EDUSA AUTH] Erreur lors de la récupération du profil Supabase:',
    err,
  );

  setProfile(null);
  setRole(null);
} finally {
  setLoading(false);
}


}

const signOut = async () => {
if (isDemo) {
setUser(null);
setProfile(null);
setRole(null);
setLoading(false);
} else {
await supabase.auth.signOut();
}
};

const value: AuthContextType = {
user,
profile,
role,
loading,
isDemo,
isAuthenticated: Boolean(user) && !loading,
signOut,
};

return (
<AuthContext.Provider value={value}>
{children}
</AuthContext.Provider>
);
}

export const useAuth = () => {
const context = useContext(AuthContext);

if (!context) {
throw new Error('useAuth must be used within AuthProvider');
}

return context;
};
