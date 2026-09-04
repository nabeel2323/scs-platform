'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getUser, onAuthChange, type AuthUser } from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sync initial state from the in-memory auth module
    setUser(getUser());
    setLoading(false);

    // Subscribe to future auth state changes
    const unsubscribe = onAuthChange((nextUser) => {
      setUser(nextUser);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to access reactive auth state (user + loading). */
export function useAuth() {
  return useContext(AuthContext);
}
