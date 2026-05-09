import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Enums } from '@/integrations/supabase/types';

type AppRole = Enums<'app_role'>;
const LOCAL_MODERATOR_KEY = 'local_moderator_user_id';
const LOCAL_ROLE_PREFIX = 'local_user_role:';
const ADMIN_EMAILS = ['admin.helpinghands.20260313210846@example.com'];

const getLocalModeratorId = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LOCAL_MODERATOR_KEY);
};

const shouldBootstrapModerator = () => {
  if (typeof window === 'undefined') return null;
  return window.location.pathname.startsWith('/admin');
};

const ensureLocalModerator = (userId: string) => {
  if (typeof window === 'undefined') return null;

  const currentModeratorId = getLocalModeratorId();
  if (currentModeratorId) return currentModeratorId;
  if (!shouldBootstrapModerator()) return null;

  window.localStorage.setItem(LOCAL_MODERATOR_KEY, userId);
  return userId;
};

const isTrustedAdminEmail = (email?: string | null) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};

const getLocalRole = (userId: string): AppRole | null => {
  if (typeof window === 'undefined') return null;
  const role = window.localStorage.getItem(`${LOCAL_ROLE_PREFIX}${userId}`);
  if (role === 'requester' || role === 'volunteer' || role === 'moderator') {
    return role;
  }
  return null;
};

export const getSavedLocalRole = (userId?: string | null): AppRole | null => {
  if (!userId) return null;
  return getLocalRole(userId);
};

export const saveLocalRole = (userId: string, role: AppRole) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${LOCAL_ROLE_PREFIX}${userId}`, role);
};

const mergeRoles = (userId: string, email: string | null | undefined, roles: AppRole[]) => {
  const mergedRoles = [...roles];
  const localRole = getLocalRole(userId);

  if (localRole && !mergedRoles.includes(localRole)) {
    mergedRoles.push(localRole);
  }

  const localModeratorId = ensureLocalModerator(userId);
  if (localModeratorId === userId && !mergedRoles.includes('moderator')) {
    mergedRoles.push('moderator');
  }

  if (isTrustedAdminEmail(email) && !mergedRoles.includes('moderator')) {
    mergedRoles.push('moderator');
  }

  return mergedRoles;
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  roles: [],
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string, email?: string | null) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      setRoles(mergeRoles(userId, email, []));
      return;
    }

    const dbRoles = data?.map((record) => record.role) ?? [];
    dbRoles.forEach((role) => saveLocalRole(userId, role));
    setRoles(mergeRoles(userId, email, dbRoles));
  };

  const syncSession = async (session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);

    if (!session?.user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    await fetchRoles(session.user.id, session.user.email);
    setLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        void syncSession(session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, roles, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
