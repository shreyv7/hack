import type { ReactElement, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import {
  clearAuthStorage,
  clearPendingEmail,
  getAccessToken,
  getMustChangePassword,
  getRefreshToken,
  setMustChangePassword,
  setPendingEmail,
  setTokens,
} from '@/lib/auth/storage';
import type { ChangePasswordPayload, LoginCredentials, SignupPayload, User } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  signup: (payload: SignupPayload) => Promise<void>;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applyTokens(access: string, refresh: string, mustChangePassword: boolean): void {
  setTokens(access, refresh, mustChangePassword);
}

async function tryRestoreSession(): Promise<{
  user: User | null;
  mustChangePassword: boolean;
}> {
  const access = getAccessToken();
  if (!access) {
    return { user: null, mustChangePassword: false };
  }

  const mustChangePassword = getMustChangePassword();

  try {
    const user = await authApi.fetchMe();
    clearPendingEmail();
    return { user, mustChangePassword: mustChangePassword || user.must_change_password };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && mustChangePassword) {
      return { user: null, mustChangePassword: true };
    }
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthStorage();
    return { user: null, mustChangePassword: false };
  }

  const tokens = await authApi.refresh(refreshToken);
  applyTokens(tokens.access_token, tokens.refresh_token, tokens.must_change_password);

  try {
    const user = await authApi.fetchMe();
    clearPendingEmail();
    return {
      user,
      mustChangePassword: tokens.must_change_password || user.must_change_password,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && tokens.must_change_password) {
      return { user: null, mustChangePassword: true };
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePasswordState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await tryRestoreSession();
        if (!cancelled) {
          setUser(session.user);
          setMustChangePasswordState(session.mustChangePassword);
        }
      } catch {
        if (!cancelled) {
          clearAuthStorage();
          setUser(null);
          setMustChangePasswordState(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokens = await authApi.login(credentials);
    applyTokens(tokens.access_token, tokens.refresh_token, tokens.must_change_password);

    if (tokens.must_change_password) {
      setPendingEmail(credentials.email.trim());
      setUser(null);
      setMustChangePasswordState(true);
      return;
    }

    clearPendingEmail();
    const me = await authApi.fetchMe();
    setUser(me);
    setMustChangePasswordState(false);
  }, []);

  const signup = useCallback(
    async (payload: SignupPayload) => {
      // Create the org + admin (pending approval), then sign them in so they
      // land on the "awaiting approval" screen with a live session.
      await authApi.signup(payload);
      await login({ email: payload.email.trim(), password: payload.password });
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) {
        await authApi.logout();
      }
    } catch {
      // still clear local session
    } finally {
      clearAuthStorage();
      setUser(null);
      setMustChangePasswordState(false);
    }
  }, []);

  const changePassword = useCallback(async (payload: ChangePasswordPayload) => {
    const updated = await authApi.changePassword(payload);
    setMustChangePassword(false);
    setMustChangePasswordState(false);
    clearPendingEmail();
    setUser(updated);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
    setMustChangePasswordState(getMustChangePassword() || me.must_change_password);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      mustChangePassword,
      signup,
      login,
      logout,
      changePassword,
      refreshUser,
    }),
    [user, isLoading, mustChangePassword, signup, login, logout, changePassword, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
