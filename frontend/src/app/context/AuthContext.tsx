// src/app/context/AuthContext.tsx
// Provides auth state to every component.
// Wrap <App /> in <AuthProvider> in main.tsx.

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { login as loginApi, fetchMe } from "../lib/endpoints";
import { token } from "../lib/api";
import type { AuthUser, UserRole } from "../lib/types";

const ROLE_LEVELS: UserRole[] = ["VIEWER", "OPERATOR", "AGENCY_LEAD", "ADMIN"];

interface AuthCtx {
  user:            AuthUser | null;
  loading:         boolean;
  isAuthenticated: boolean;
  login:           (email: string, password: string) => Promise<void>;
  logout:          () => void;
  hasRole:         (min: UserRole) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token.exists()) { setLoading(false); return; }
    fetchMe()
      .then(u  => { setUser(u);    setLoading(false); })
      .catch(() => { token.clear(); setLoading(false); });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: t, user: u } = await loginApi(email, password);
    token.set(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    token.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback((min: UserRole) => {
    if (!user) return false;
    return ROLE_LEVELS.indexOf(user.role) >= ROLE_LEVELS.indexOf(min);
  }, [user]);

  return (
    <Ctx.Provider value={{ user, loading, isAuthenticated: Boolean(user), login, logout, hasRole }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
