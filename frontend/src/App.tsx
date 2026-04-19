import { useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./app/context/AuthContext";
import { useWebSocket } from "./app/hooks/useWebSocket";
import Login from "./app/components/Login";
import Shell from "./app/components/Shell";
import Landing from "./app/components/Landing";

function Inner() {
  const { user, isAuthenticated, loading } = useAuth();
  const [page, setPage] = useState("landing");
  const [sysStatus, setSysStatus] = useState<"normal" | "critical">("normal");
  const [showLogin, setShowLogin] = useState(false);

  // Use organizationId for WS room — NOT user.id
  // orgId must match what the server uses to query graphNodes
  const wsOrgId = user?.organizationId ?? "";

  const { connected } = useWebSocket({
    orgId: wsOrgId,
    enabled: isAuthenticated && Boolean(wsOrgId),
    onRiskSpike: useCallback((p: any) => {
      if (p.threshold >= 0.8) setSysStatus("critical");
    }, []),
    onAllocationApproved: useCallback(() => {
      setSysStatus("normal");
    }, []),
    onSimulationComplete: useCallback(() => {
      // can trigger a dashboard refresh here if needed
    }, []),
  });

  const nav = (p: string) => {
    if (p === "login") { setShowLogin(true); return; }
    if (!isAuthenticated && p !== "landing" && p !== "report") {
      setShowLogin(true);
      return;
    }
    setShowLogin(false);
    setPage(p);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--void)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <span className="mono text-xs text-[var(--muted)]">
          PDGE INITIALIZING
        </span>
      </div>
    </div>
  );

  if (showLogin) return (
    <Login
      onSuccess={() => { setShowLogin(false); setPage("dashboard"); }}
      onBack={() => setShowLogin(false)}
    />
  );

  if (page === "landing") return <Landing onNav={nav} />;

  return (
    <Shell
      page={page}
      onNav={nav}
      sysStatus={sysStatus}
      wsConnected={connected}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}