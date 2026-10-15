'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  role: 'PLAYER' | 'ADMIN' | 'SUPPORT' | 'FINANCE';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  language: 'en' | 'am';
  twoFactor?: boolean;
}

type Ctx = { user: User | null; loading: boolean; reload: () => Promise<User | null>; logout: () => Promise<void> };
const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();

  const reload = useCallback(async () => {
    try {
      let { user } = await api<{ user: User | null }>('/auth/me');
      if (!user) {
        // Access token may simply have expired; try the refresh cookie once.
        const ok = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'spin' } }).then((r) => r.ok);
        if (ok) user = (await api<{ user: User | null }>('/auth/me')).user;
      }
      setUser(user);
      if (user) setLang(user.language);
      return user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLang]);

  useEffect(() => {
    reload();
  }, [reload]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, reload, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
