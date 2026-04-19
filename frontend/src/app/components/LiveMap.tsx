import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useApi } from "../hooks/useApi";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAuth } from "../context/AuthContext";
import { fetchGraphSnapshot, fetchIncidents } from "../lib/endpoints";
import type { GraphSnapshot, GraphNode, Incident } from "../lib/types";
import { MapPin, AlertTriangle, Activity } from "lucide-react";

const LAT_MIN=18.89, LAT_MAX=19.14, LNG_MIN=72.80, LNG_MAX=72.95;
const W=560, H=400;
function toXY(lat:number, lng:number): [number,number] {
  return [((lng-LNG_MIN)/(LNG_MAX-LNG_MIN))*W, ((LAT_MAX-lat)/(LAT_MAX-LAT_MIN))*H];
}
function riskColor(risk:number, type:string) {
  if (type==="DEPOT") return "#00FFB2";
  if (type==="HOSPITAL") return "#3B8BFF";
  if (type==="SHELTER") return "#7B61FF";
  if (risk>=0.8) return "#FF3366";
  if (risk>=0.5) return "#FF6B2B";
  if (risk>=0.2) return "#FFB020";
  return "#1A2332";
}

export default function LiveMap() {
  const { user } = useAuth();
  const [sel, setSel] = useState<string|null>(null);
  const [liveRisk, setLiveRisk] = useState<Record<string,number>>({});
  const { data:snap, loading, refetch } = useApi<GraphSnapshot>(fetchGraphSnapshot, []);
  const { data:incidents } = useApi<Incident[]>(fetchIncidents, []);
  useWebSocket({
    orgId: user?.id ?? "", enabled: Boolean(user),
    onInitialState: useCallback((p:any) => { if (p?.riskMap) setLiveRisk(p.riskMap); }, []),
    onRiskSpike: useCallback((p:any) => setLiveRisk(prev => ({...prev,[p.nodeId]:p.newRisk})), []),
    onSimulationComplete: useCallback(() => refetch(), [refetch]),
  });
  const nodes = snap?.nodes ?? [];
  const edges = snap?.edges ?? [];
  const activeInc = incidents?.filter(i => ["VERIFIED","ACTIVE"].includes(i.status)) ?? [];
  const risk = (n:GraphNode) => liveRisk[n.id] ?? n.disasterRisk ?? 0;
  const selNode = nodes.find(n => n.id===sel);

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          {label:"Total nodes",val:nodes.length},
          {label:"High risk",val:nodes.filter(n=>risk(n)>=0.5).length,accent:true},
          {label:"Active incidents",val:activeInc.length,accent:activeInc.length>0},
          {label:"Blocked edges",val:(snap?.edges??[]).filter(e=>e.status==="BLOCKED").length},
        ].map(s => (
          <div key={s.label} className="panel p-4">
            <p className="mono text-xs mb-1 text-[var(--muted)]">{s.label}</p>
            <p className={`text-2xl font-light ${s.accent ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Map */}
        <div className="col-span-2 panel overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2"><MapPin size={13} className="text-[var(--accent)]"/><span className="mono text-xs text-[var(--text)]">MUMBAI CITY GRAPH</span></div>
            <div className="flex gap-3 text-xs mono text-[var(--muted)]">
              {[{cls:"bg-[#FF3366]",l:"Critical"},{cls:"bg-[#FF6B2B]",l:"High"},{cls:"bg-[#FFB020]",l:"Watch"},{cls:"bg-[#1A2332]",l:"Safe"}].map(x=>(
                <span key={x.l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full inline-block ${x.cls}`}/>{x.l}</span>
              ))}
            </div>
          </div>
          <div className="relative h-[420px] bg-[var(--surface)]">
            <div className="absolute inset-0 opacity-30 bg-grid-bg"/>
            {loading && <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"/></div>}
            {!loading && (
              <svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                {edges.map(e => {
                  const fn = nodes.find(n=>n.id===e.fromNodeId), tn = nodes.find(n=>n.id===e.toNodeId);
                  if (!fn||!tn) return null;
                  const [x1,y1]=toXY(fn.latitude,fn.longitude), [x2,y2]=toXY(tn.latitude,tn.longitude);
                  return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={e.status==="BLOCKED"?"#FF3366":e.status==="SLOW"?"#FF6B2B":"#1A2332"} strokeWidth={e.status==="BLOCKED"?2:1} strokeDasharray={e.status==="BLOCKED"?"4 3":"none"} opacity={0.7}/>;
                })}
                {nodes.map(n => {
                  const [x,y]=toXY(n.latitude,n.longitude), r=risk(n), c=riskColor(r,n.type), isSel=sel===n.id;
                  return (
                    <g key={n.id} onClick={()=>setSel(isSel?null:n.id)} className="cursor-pointer">
                      {r>=0.5 && <circle cx={x} cy={y} r={16} fill={c} opacity={0.15}><animate attributeName="r" values="10;20;10" dur="2s" repeatCount="indefinite"/></circle>}
                      <circle cx={x} cy={y} r={isSel?7:5} fill={c} stroke={isSel?"white":c} strokeWidth={isSel?2:0.5} opacity={0.9}/>
                    </g>
                  );
                })}
                {activeInc.map(inc => {
                  if (!inc.latitude||!inc.longitude) return null;
                  const [x,y]=toXY(inc.latitude,inc.longitude);
                  return (
                    <g key={inc.id}>
                      <circle cx={x} cy={y} r={12} fill="var(--danger)" opacity={0.2}><animate attributeName="r" values="8;16;8" dur="1.5s" repeatCount="indefinite"/></circle>
                      <text x={x} y={y+4} textAnchor="middle" fontSize={10} fill="var(--danger)">⚠</text>
                    </g>
                  );
                })}
              </svg>
            )}
            {/* Node detail popup */}
            {selNode && (
              <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="absolute bottom-3 left-3 right-3 p-4 rounded-xl bg-[rgba(10,14,23,0.95)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm text-[var(--text)]">{selNode.label}</p>
                  <span className="mono text-xs px-2 py-0.5 rounded bg-[rgba(0,255,178,0.08)] text-[var(--accent)]">{selNode.type}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs mono text-[var(--muted)]">
                  <span>Pop: {selNode.population.toLocaleString()}</span>
                  <span>Load: {selNode.currentLoad}/{selNode.capacity}</span>
                  <span className={risk(selNode)>0.5 ? "text-[var(--danger)]" : "text-[var(--accent)]"}>Risk: {(risk(selNode)*100).toFixed(0)}%</span>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Incidents list */}
        <div className="panel flex flex-col">
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2"><Activity size={13} className="text-[var(--accent)]"/><span className="mono text-xs text-[var(--text)]">ACTIVE INCIDENTS</span></div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeInc.length===0 && <div className="flex flex-col items-center justify-center h-full gap-2"><Activity size={20} className="text-[var(--border)]"/><p className="mono text-xs text-[var(--muted)]">Clear</p></div>}
            {activeInc.map((inc,i) => (
              <motion.div key={inc.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.05}} onClick={()=>setSel(inc.originNodeId)} className={`p-3 rounded-lg cursor-pointer transition-all bg-[var(--surface)] border ${sel===inc.originNodeId ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--text)]">{inc.type}</span>
                  <span className={`tag ${inc.status==="VERIFIED"?"tag-critical":"tag-high"}`}>{inc.status}</span>
                </div>
                <p className="mono text-xs truncate text-[var(--muted)]">{inc.originNode?.label ?? `${inc.latitude?.toFixed(3)},${inc.longitude?.toFixed(3)}`}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-0.5 rounded bg-[var(--border)] overflow-hidden"><motion.div className="h-full rounded bg-[var(--accent)]" initial={{width:0}} animate={{width:`${inc.trustScore}%`}} transition={{duration:0.6}}/></div>
                  <span className="mono text-xs text-[var(--muted)]">{inc.trustScore.toFixed(0)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
