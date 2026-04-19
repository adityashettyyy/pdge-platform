import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { login as loginApi, fetchMe } from "../lib/endpoints";
import { token } from "../lib/api";
import type { AuthUser, UserRole } from "../lib/types";
const ROLES: UserRole[] = ["VIEWER","OPERATOR","AGENCY_LEAD","ADMIN"];
interface Ctx { user:AuthUser|null; loading:boolean; isAuthenticated:boolean; login:(e:string,p:string)=>Promise<void>; logout:()=>void; hasRole:(min:UserRole)=>boolean; }
const AuthCtx = createContext<Ctx|null>(null);
export function AuthProvider({ children }: { children:ReactNode }) {
  const [user, setUser] = useState<AuthUser|null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token.exists()) { setLoading(false); return; }
    fetchMe().then(u => { setUser(u); setLoading(false); }).catch(() => { token.clear(); setLoading(false); });
  }, []);
  const login = useCallback(async (email:string, password:string) => {
    const { token: t, user: u } = await loginApi(email, password);
    token.set(t); setUser(u);
  }, []);
  const logout = useCallback(() => { token.clear(); setUser(null); }, []);
  const hasRole = useCallback((min:UserRole) => {
    if (!user) return false;
    return ROLES.indexOf(user.role) >= ROLES.indexOf(min);
  }, [user]);
  return <AuthCtx.Provider value={{ user, loading, isAuthenticated: Boolean(user), login, logout, hasRole }}>{children}</AuthCtx.Provider>;
}
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
