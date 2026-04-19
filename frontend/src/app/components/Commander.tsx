import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, CheckCircle, Loader, AlertTriangle, Package, FileText } from "lucide-react";
import { useApi, useApiMutation } from "../hooks/useApi";
import { fetchIncidents, fetchAllocationPlans, generateSitrep, approvePlan } from "../lib/endpoints";
import type { Incident, AllocationPlan } from "../lib/types";

export default function Commander() {
  const [selIncident, setSelIncident] = useState<string|null>(null);
  const [sitrep, setSitrep] = useState<string|null>(null);
  const { data:incidents } = useApi<Incident[]>(fetchIncidents, []);
  const { data:plans, refetch:refetchPlans } = useApi<AllocationPlan[]>(fetchAllocationPlans, []);
  const { mutate:doSitrep, loading:sitrepLoading } = useApiMutation(({id}:{id:string})=>generateSitrep(id), r=>setSitrep(r.sitrep));
  const { mutate:doApprove, loading:approveLoading } = useApiMutation(({id}:{id:string})=>approvePlan(id), ()=>refetchPlans());
  const verified = incidents?.filter(i=>["VERIFIED","ACTIVE"].includes(i.status)) ?? [];
  const pending = plans?.filter(p=>["GENERATED","PENDING_APPROVAL"].includes(p.status)) ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded flex items-center justify-center bg-[rgba(123,97,255,0.15)]">
          <Brain size={16} className="text-[#7B61FF]"/>
        </div>
        <div>
          <h1 className="text-xl font-light text-[var(--text)]">AI Commander</h1>
          <p className="mono text-xs text-[var(--muted)]">Claude-generated sitreps · Allocation plan approval</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Incidents + sitrep */}
        <div className="space-y-4">
          <div className="panel">
            <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]"><AlertTriangle size={13} className="text-[var(--danger)]"/><span className="mono text-xs text-[var(--text)]">VERIFIED INCIDENTS</span></div>
            <div className="p-3 space-y-2">
              {verified.length===0 && <p className="mono text-xs text-center py-6 text-[var(--muted)]">No verified incidents</p>}
              {verified.map(inc => (
                <button key={inc.id} onClick={()=>{setSelIncident(inc.id);setSitrep(null);}} className={`w-full text-left p-3 rounded-lg transition-all ${selIncident===inc.id ? "bg-[rgba(123,97,255,0.08)] border border-[rgba(123,97,255,0.4)]" : "bg-[var(--surface)] border border-[var(--border)]"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--text)]">{inc.type}</p>
                    <span className={`tag ${inc.status==="ACTIVE"?"tag-high":"tag-critical"}`}>{inc.status}</span>
                  </div>
                  <p className="mono text-xs mt-1 truncate text-[var(--muted)]">{inc.originNode?.label ?? inc.id.slice(0,12)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-0.5 rounded bg-[var(--border)] overflow-hidden"><motion.div className="h-full rounded bg-[#7B61FF]" initial={{width:0}} animate={{width:`${inc.trustScore}%`}} transition={{duration:0.6}}/></div>
                    <span className="mono text-xs text-[var(--muted)]">{inc.trustScore.toFixed(0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {selIncident && (
            <motion.button whileTap={{scale:0.98}} onClick={()=>doSitrep({id:selIncident})} disabled={sitrepLoading} className={`btn w-full justify-center border ${sitrepLoading ? "opacity-70" : "opacity-100"} border-[rgba(123,97,255,0.25)] bg-[rgba(123,97,255,0.1)] text-[#7B61FF]`}>
              {sitrepLoading ? <><Loader size={14} className="animate-spin"/>GENERATING SITREP…</> : <><Brain size={14}/>GENERATE SITREP</>}
            </motion.button>
          )}
        </div>

        {/* Sitrep output */}
        <div className="panel flex flex-col">
          <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]"><FileText size={13} className="text-[#7B61FF]"/><span className="mono text-xs text-[var(--text)]">SITUATION REPORT</span></div>
          <div className="flex-1 p-4">
            {!sitrep && !sitrepLoading && <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40"><Brain size={24} className="text-[#7B61FF]"/><p className="mono text-xs text-[var(--muted)]">Select an incident and generate</p></div>}
            {sitrepLoading && <div className="space-y-3">{["w-[60%]","w-[68%]","w-[76%]","w-[84%]","w-[92%]"].map((widthClass,i)=><div key={i} className={`${widthClass} h-3 rounded animate-pulse bg-[var(--surface)]`} />)}</div>}
            {sitrep && <motion.div initial={{opacity:0}} animate={{opacity:1}}><p className="text-sm leading-relaxed whitespace-pre-wrap font-mono text-[var(--text)] text-[12px]">{sitrep}</p></motion.div>}
          </div>
        </div>
      </div>

      {/* Pending plans */}
      <div className="panel">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2"><Package size={13} className="text-[var(--accent)]"/><span className="mono text-xs text-[var(--text)]">ALLOCATION PLANS — AWAITING APPROVAL</span></div>
          <span className="tag tag-high">{pending.length} pending</span>
        </div>
        <div className="p-3 space-y-3">
          {pending.length===0 && <div className="flex items-center justify-center gap-2 py-8"><CheckCircle size={16} className="text-[var(--accent)] opacity-40"/><p className="mono text-xs text-[var(--muted)]">All plans approved</p></div>}
          {pending.map(plan => (
            <motion.div key={plan.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="p-4 rounded-lg bg-[var(--surface)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="mono text-xs font-medium text-[var(--text)]">{plan.strategyUsed}</span>
                    <span className="mono text-xs text-[var(--muted)]">{plan.totalResources} resources · {(plan.confidence*100).toFixed(0)}% confidence</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {plan.assignments.slice(0,4).map(a=>(
                      <span key={a.id} className={`tag ${a.priority==="CRITICAL"?"tag-critical":a.priority==="HIGH"?"tag-high":"tag-medium"}`}>
                        {a.resource?.label??a.resourceId.slice(0,6)} → {a.toNodeId.replace("node-","")} {a.etaMinutes}m
                      </span>
                    ))}
                    {plan.assignments.length>4 && <span className="mono text-xs text-[var(--muted)]">+{plan.assignments.length-4} more</span>}
                  </div>
                </div>
                <motion.button whileTap={{scale:0.97}} onClick={()=>doApprove({id:plan.id})} disabled={approveLoading} className="btn flex-shrink-0 border border-[rgba(0,255,178,0.2)] bg-[rgba(0,255,178,0.08)] text-[var(--accent)]">
                  {approveLoading ? <Loader size={13} className="animate-spin"/> : <><CheckCircle size={13}/>APPROVE</>}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
