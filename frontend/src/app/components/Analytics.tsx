import { motion } from "framer-motion";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useApi } from "../hooks/useApi";
import { fetchMonthlyStats, fetchZoneResponseTimes, fetchDisasterTypeStats, fetchDashboardKPIs } from "../lib/endpoints";
import type { DashboardKPIs } from "../lib/types";
import { TrendingUp, Activity, AlertTriangle } from "lucide-react";

const PIE_COLORS = ["#00FFB2","#FF3366","#FF6B2B","#3B8BFF","#7B61FF","#FFB020"];
const TT = ({ active, payload }: any) => active && payload?.length ? (
  <div className="p-3 rounded-lg bg-[var(--panel)] border border-[var(--border)]">
    <p className="mono text-xs text-[var(--muted)]">{payload[0]?.payload?.month??payload[0]?.payload?.zone??payload[0]?.payload?.type}</p>
    {payload.map((e:any,i:number) => <p key={i} className="text-sm text-[var(--text)]">{e.name??e.dataKey}: {typeof e.value==="number"?e.value.toFixed(1):e.value}</p>)}
  </div>
) : null;

export default function Analytics() {
  const { data:kpis, loading:kl } = useApi<DashboardKPIs>(fetchDashboardKPIs, []);
  const { data:monthly, loading:ml } = useApi<any[]>(fetchMonthlyStats, []);
  const { data:zones, loading:zl } = useApi<any[]>(fetchZoneResponseTimes, []);
  const { data:types, loading:tl } = useApi<any[]>(fetchDisasterTypeStats, []);

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {label:"Total incidents",val:kpis?(kpis.activeIncidents+kpis.verifiedIncidents):"…"},
          {label:"Avg response",val:kpis?`${kpis.avgResponseTimeMin.toFixed(1)}m`:"…"},
          {label:"Deployed now",val:kpis?.resourcesDeployed??"…"},
          {label:"Simulations",val:kpis?.simulationsRun??"…"},
        ].map((k,i) => (
          <motion.div key={i} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}} className="panel p-4">
            <p className="mono text-xs mb-2 text-[var(--muted)]">{k.label}</p>
            <p className="text-2xl font-light text-[var(--text)]">{kl?"…":k.val}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Monthly trend */}
        <div className="panel">
          <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]"><TrendingUp size={13} className="text-[var(--accent)]"/><span className="mono text-xs text-[var(--text)]">MONTHLY TRENDS</span></div>
          <div className="p-4">
            {ml ? <div className="h-52 animate-pulse rounded bg-[var(--surface)]"/> :
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={monthly??[]} margin={{top:4,right:4,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="month" tick={{fontSize:11, fill:"var(--muted)"}} stroke="var(--muted)"/>
                  <YAxis tick={{fontSize:11, fill:"var(--muted)"}} stroke="var(--muted)"/>
                  <Tooltip content={<TT/>}/>
                  <Line type="monotone" dataKey="incidents" stroke="var(--danger)" strokeWidth={2} dot={false} name="Incidents"/>
                  <Line type="monotone" dataKey="resolved" stroke="var(--accent)" strokeWidth={2} dot={false} name="Resolved"/>
                </LineChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Disaster types */}
        <div className="panel">
          <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]"><AlertTriangle size={13} className="text-[var(--danger)]"/><span className="mono text-xs text-[var(--text)]">DISASTER TYPES</span></div>
          <div className="p-4">
            {tl ? <div className="h-52 animate-pulse rounded bg-[var(--surface)]"/> :
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={types??[]} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="type" labelLine={false} label={({type,percentage}:any)=>`${type} ${percentage?.toFixed(0)}%`} />
                    {(types??[]).map((_:any,i:number)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>) }
                  <Tooltip content={<TT/>}/>
                </PieChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Zone response times */}
        <div className="panel">
          <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]"><Activity size={13} className="text-[var(--info)]"/><span className="mono text-xs text-[var(--text)]">ZONE RESPONSE TIMES (min)</span></div>
          <div className="p-4">
            {zl ? <div className="h-52 animate-pulse rounded bg-[var(--surface)]"/> :
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={zones??[]} layout="vertical" margin={{left:0,right:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11, fill:"var(--muted)"}} stroke="var(--muted)"/>
                  <YAxis type="category" dataKey="zone" tick={{fontSize:10, fill:"var(--muted)"}} stroke="var(--muted)" width={80}/>
                  <Tooltip content={<TT/>}/>
                  <Bar dataKey="avgMinutes" name="Minutes" radius={[0,4,4,0]}>
                    {(zones??[]).map((z:any,i:number)=><Cell key={i} fill={z.avgMinutes>10?"var(--danger)":z.avgMinutes>7?"var(--warn)":"var(--accent)"}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Counterfactual */}
        <div className="panel">
          <div className="p-4 border-b border-[var(--border)]"><span className="mono text-xs text-[var(--text)]">PDGE VS TRADITIONAL</span></div>
          <div className="p-5 space-y-5">
            <div className="flex items-end gap-6">
              <div><p className="mono text-xs mb-1 text-[var(--muted)]">PDGE AVG RESPONSE</p><p className="text-4xl font-light text-[var(--accent)]">{kpis?.avgResponseTimeMin?.toFixed(1)??"—"}<span className="text-lg">m</span></p></div>
              <div><p className="mono text-xs mb-1 text-[var(--muted)]">TRADITIONAL</p><p className="text-4xl font-light text-[var(--muted)]">18.0<span className="text-lg">m</span></p></div>
            </div>
            {kpis?.avgResponseTimeMin && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="p-4 rounded-lg bg-[rgba(0,255,178,0.05)] border border-[rgba(0,255,178,0.15)]">
                <p className="text-2xl font-light text-[var(--accent)]">{(18-kpis.avgResponseTimeMin).toFixed(1)}m faster</p>
                <p className="mono text-xs mt-1 text-[var(--muted)]">{((18-kpis.avgResponseTimeMin)/18*100).toFixed(0)}% improvement via predictive pre-positioning</p>
              </motion.div>
            )}
            <div className="space-y-3">
              {[{l:"Prediction accuracy",v:84},{l:"Spread coeff tuned",v:72},{l:"Allocation efficiency",v:91}].map(r=>(
                <div key={r.l}>
                  <div className="flex justify-between mono text-xs mb-1"><span className="text-[var(--muted)]">{r.l}</span><span className="text-[var(--accent)]">{r.v}%</span></div>
                  <div className="h-1 rounded bg-[var(--border)] overflow-hidden"><motion.div initial={{width:0}} animate={{width:`${r.v}%`}} transition={{duration:1,delay:0.5}} className="h-full rounded bg-[var(--accent)]"/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
