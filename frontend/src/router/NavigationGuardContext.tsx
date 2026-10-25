import type { ReactElement, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';

type NavigationGuardFn = (targetPath: string) => Promise<boolean>;

interface NavigationGuardContextValue {
  guardedNavigate: (path: string) => Promise<void>;
  registerGuard: (guard: NavigationGuardFn | null) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate();
  const guardRef = useRef<NavigationGuardFn | null>(null);

  const registerGuard = useCallback((guard: NavigationGuardFn | null) => {
    guardRef.current = guard;
  }, []);

  const guardedNavigate = useCallback(
    async (path: string) => {
      if (guardRef.current) {
        const allowed = await guardRef.current(path);
        if (!allowed) return;
      }
      navigate(path);
    },
    [navigate],
  );

  const value = useMemo(
    () => ({ guardedNavigate, registerGuard }),
    [guardedNavigate, registerGuard],
  );

  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export function useNavigationGuard(): NavigationGuardContextValue {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) {
    throw new Error('useNavigationGuard must be used within NavigationGuardProvider');
  }
  return ctx;
}
