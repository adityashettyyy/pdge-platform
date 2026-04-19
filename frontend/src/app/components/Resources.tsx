import { motion } from "framer-motion";
import { useApi } from "../hooks/useApi";
import { fetchResources, fetchAllocationPlans } from "../lib/endpoints";
import type { Resource, AllocationPlan, ResourceType } from "../lib/types";
import { Package, Ambulance, Truck, Users, Radio, CheckCircle } from "lucide-react";

const ICONS: Record<string, any> = { AMBULANCE:Ambulance, FIRE_TRUCK:Truck, RESCUE_TEAM:Users, DRONE:Radio, SUPPLY_TRUCK:Truck, HELICOPTER:Radio };
const STATUS_COLORS: Record<string,string> = { IDLE:"var(--accent)", TRANSIT:"var(--warn)", DEPLOYED:"var(--danger)", PRE_POSITIONED:"var(--info)", MAINTENANCE:"var(--muted)" };

function group(resources: Resource[]) {
  const g: Record<string,{idle:number;deployed:number;total:number}> = {};
  for (const r of resources) {
    if (!g[r.type]) g[r.type] = {idle:0,deployed:0,total:0};
    g[r.type].total++;
    if (r.status==="IDLE"||r.status==="PRE_POSITIONED") g[r.type].idle++;
    else g[r.type].deployed++;
  }
  return g;
}

export default function Resources() {
  const { data:resources, loading:rl } = useApi<Resource[]>(fetchResources, []);
  const { data:plans, loading:pl } = useApi<AllocationPlan[]>(fetchAllocationPlans, []);
  const grouped = group(resources ?? []);
  const recentAssignments = (plans??[]).flatMap(p=>p.assignments.map(a=>({...a,strategy:p.strategyUsed,planStatus:p.status}))).slice(0,10);

  return (
    <div className="p-6 space-y-6">
      {/* Type cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {rl ? [1,2,3,4,5,6].map(i=><div key={i} className="panel h-28 animate-pulse"/>) :
          Object.entries(grouped).map(([type,g],i) => {
            const Icon = ICONS[type] ?? Package;
            const util = g.total > 0 ? (g.deployed/g.total) : 0;
            return (
              <motion.div key={type} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}} className="panel p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><Icon size={13} className="text-[var(--accent)]"/><span className="mono text-xs text-[var(--text)]">{type.replace("_"," ")}</span></div>
                  <span className="mono text-xs text-[var(--muted)]">{g.total} total</span>
                </div>
                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="text-[var(--accent)]">{g.idle} idle</span>
                  <span className="text-[var(--warn)]">{g.deployed} deployed</span>
                </div>
                <div className="h-1 rounded bg-[var(--border)] overflow-hidden"><motion.div className="h-full rounded bg-[var(--warn)]" initial={{width:0}} animate={{width:`${util*100}%`}} transition={{duration:0.6}}/></div>
              </motion.div>
            );
          })
        }
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Allocations */}
        <div className="col-span-2 panel">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <span className="mono text-xs text-[var(--text)]">RECENT ALLOCATIONS</span>
            <motion.span className="mono text-xs text-[var(--accent)]" animate={{opacity:[1,0.5,1]}} transition={{duration:2,repeat:Infinity}}>LIVE</motion.span>
          </div>
          <div className="p-3 space-y-2">
            {pl && [1,2,3].map(i=><div key={i} className="h-12 rounded animate-pulse bg-[var(--surface)]"/>) }
            {!pl && recentAssignments.length===0 && <div className="flex flex-col items-center justify-center py-10 gap-2"><CheckCircle size={20} className="text-[var(--border)]"/><p className="mono text-xs text-[var(--muted)]">No allocations yet</p></div>}
            {recentAssignments.map((a,i) => {
              const res = resources?.find(r=>r.id===a.resourceId);
              const Icon = ICONS[res?.type??""] ?? Package;
              return (
                <motion.div key={a.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface)]">
                  <Icon size={13} className="text-[var(--muted)]"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">{a.resource?.label ?? a.resourceId.slice(0,8)}</p>
                    <p className="mono text-xs truncate text-[var(--muted)]">{a.fromNodeId.replace("node-","")} → {a.toNodeId.replace("node-","")} · {a.etaMinutes}m</p>
                  </div>
                  <span className={`tag ${a.priority==="CRITICAL"?"tag-critical":a.priority==="HIGH"?"tag-high":"tag-medium"}`}>{a.priority}</span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Fleet status */}
        <div className="panel flex flex-col">
          <div className="p-4 border-b border-[var(--border)]"><span className="mono text-xs text-[var(--text)]">FLEET STATUS</span></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {(resources??[]).map(r => {
              const Icon = ICONS[r.type] ?? Package;
              return (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--surface)]">
                  <Icon size={12} className="text-[var(--muted)]"/>
                  <span className="text-xs flex-1 text-[var(--text)]">{r.label}</span>
                  <span className={`mono text-xs ${r.status === "IDLE" ? "text-[var(--accent)]" : r.status === "TRANSIT" ? "text-[var(--warn)]" : r.status === "DEPLOYED" ? "text-[var(--danger)]" : r.status === "PRE_POSITIONED" ? "text-[var(--info)]" : "text-[var(--muted)]"}`}>{r.status}</span>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-[var(--border)]">
            <div className="grid grid-cols-2 gap-2 mono text-xs">
              <span className="text-[var(--muted)]">Total: <span className="text-[var(--text)]">{resources?.length??0}</span></span>
              <span className="text-[var(--muted)]">Idle: <span className="text-[var(--accent)]">{resources?.filter(r=>r.status==="IDLE").length??0}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
