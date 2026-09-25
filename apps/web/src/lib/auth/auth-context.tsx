import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  type LoginInput,
} from './auth-client';
import type { AuthUser } from './types';

type AuthContextState = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<{ ok: boolean; code?: string; message?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextState | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await getCurrentUser();

    if (result.success) {
      setUser(result.data.user);
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await loginRequest(input);
    if (!result.success) {
      return {
        ok: false,
        code: result.error.code,
        message: result.error.message,
      };
    }

    setUser(result.data.user);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      logout,
      refresh,
      setUser,
    }),
    [isLoading, login, logout, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
