import { motion } from "framer-motion";
import { AlertTriangle, Package, Activity, Clock, Zap, CheckCircle, Flame, Droplets } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { fetchDashboardKPIs, fetchIncidents } from "../lib/endpoints";
import type { DashboardKPIs, Incident } from "../lib/types";

const DISASTER_ICON: Record<string, any> = { FLOOD:Droplets, FIRE:Flame, default:AlertTriangle };
const STATUS_TAG: Record<string, string> = { VERIFIED:"tag-critical", ACTIVE:"tag-high", MONITORING:"tag-medium", UNVERIFIED:"tag-low", CLOSED:"tag-closed" };

function KPI({ label, value, sub, accent=false }: { label:string; value:string|number; sub?:string; accent?:boolean }) {
  return (
    <div className="panel p-5">
      <p className="mono text-xs mb-2 text-[var(--muted)]">{label}</p>
      <p className={`text-3xl font-light ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{value}</p>
      {sub && <p className="mono text-xs mt-1 text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: kpis, loading: kl } = useApi<DashboardKPIs>(fetchDashboardKPIs, []);
  const { data: incidents, loading: il } = useApi<Incident[]>(fetchIncidents, []);
  const active = incidents?.filter(i => ["VERIFIED","ACTIVE","MONITORING"].includes(i.status)) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kl ? [1,2,3,4].map(i => <div key={i} className="panel p-5 h-24 animate-pulse bg-[var(--panel)]"/>) : <>
          <KPI label="ACTIVE INCIDENTS" value={kpis?.activeIncidents ?? 0} sub="verified + active" accent/>
          <KPI label="RESOURCES DEPLOYED" value={kpis?.resourcesDeployed ?? 0} sub={`${kpis?.resourcesAvailable ?? 0} idle`}/>
          <KPI label="SIMULATIONS RUN" value={kpis?.simulationsRun ?? 0} sub="BFS runs total"/>
          <KPI label="AVG RESPONSE TIME" value={kpis?.avgResponseTimeMin ? `${kpis.avgResponseTimeMin.toFixed(1)}m` : "—"} sub="vs 18m traditional"/>
        </>}
      </div>

      {/* Pending plans alert */}
      {kpis && kpis.plansAwaitingApproval > 0 && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="panel p-4 flex items-center gap-3 border border-[rgba(255,107,43,0.4)]">
          <Zap size={16} className="text-[var(--warn)]"/>
          <p className="text-sm text-[var(--text)]"><span className="text-[var(--warn)]">{kpis.plansAwaitingApproval} allocation plan{kpis.plansAwaitingApproval>1?"s":""}</span> awaiting operator approval in AI Commander</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active incidents */}
        <div className="lg:col-span-2 panel">
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--danger)]"/>
              <span className="mono text-xs font-medium text-[var(--text)]">ACTIVE INCIDENTS</span>
            </div>
            <span className="tag tag-critical">{active.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {il && [1,2,3].map(i => <div key={i} className="h-14 rounded-lg animate-pulse bg-[var(--surface)]"/>) }
            {!il && active.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <CheckCircle size={24} className="text-[var(--accent)] opacity-40"/>
                <p className="mono text-xs text-[var(--muted)]">No active incidents</p>
              </div>
            )}
            {active.map((inc, i) => {
              const Icon = DISASTER_ICON[inc.type] ?? DISASTER_ICON.default;
              return (
                <motion.div key={inc.id} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface)]">
                  <Icon size={14} className={inc.status === "VERIFIED" ? "text-danger" : "text-[var(--warn)]"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-[var(--text)]">{inc.type} — {inc.originNode?.label ?? `${inc.latitude?.toFixed(3)}, ${inc.longitude?.toFixed(3)}`}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden bg-[var(--border)]">
                        <motion.div className="h-full rounded-full bg-[var(--accent)]" initial={{width:0}} animate={{width:`${inc.trustScore}%`}} transition={{duration:0.6}}/>
                      </div>
                      <span className="mono text-xs text-[var(--muted)]">{inc.trustScore.toFixed(0)}</span>
                    </div>
                  </div>
                  <span className={`tag ${STATUS_TAG[inc.status] ?? "tag-low"}`}>{inc.status}</span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* System status */}
        <div className="panel">
          <div className="p-5 border-b border-[var(--border)]">
            <span className="mono text-xs font-medium text-[var(--text)]">SYSTEM STATUS</span>
          </div>
          <div className="p-5 space-y-4">
            {[
              {label:"Verified incidents",val:kpis?.verifiedIncidents??0,color:"var(--danger)"},
              {label:"Plans pending",val:kpis?.plansAwaitingApproval??0,color:"var(--warn)"},
              {label:"Idle resources",val:kpis?.resourcesAvailable??0,color:"var(--accent)"},
              {label:"Deployed",val:kpis?.resourcesDeployed??0,color:"var(--info)"},
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between py-3 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--muted)]">{r.label}</span>
                <span className={`mono text-lg font-medium ${r.color === "var(--danger)" ? "text-[var(--danger)]" : r.color === "var(--warn)" ? "text-[var(--warn)]" : r.color === "var(--accent)" ? "text-[var(--accent)]" : r.color === "var(--info)" ? "text-[var(--info)]" : "text-[var(--text)]"}`}>{kl?"…":r.val}</span>
              </div>
            ))}
            <div className="pt-2">
              <p className="mono text-xs mb-2 text-[var(--muted)]">SYSTEM UPTIME</p>
              <p className="mono text-2xl text-[var(--accent)]">99.9<span className="text-sm">%</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
