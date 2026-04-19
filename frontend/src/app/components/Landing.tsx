import { motion } from "framer-motion";
import { Shield, Zap, Activity, ArrowRight, Radio } from "lucide-react";

interface Props { onNav:(p:string)=>void; }

export default function Landing({ onNav }: Props) {
  return (
    <div className="min-h-screen grid-bg scan-effect flex flex-col bg-[var(--void)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-[var(--accent)]"/>
          <span className="mono text-sm font-medium text-[var(--accent)]">PDGE</span>
          <span className="mono text-xs px-2 py-0.5 rounded bg-[rgba(0,255,178,0.08)] text-[var(--muted)]">v2.0</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse bg-[var(--accent)]"/>
          <span className="mono text-xs text-[var(--muted)]">SYSTEM OPERATIONAL</span>
        </div>
        <button className="btn btn-ghost mono text-xs" onClick={() => onNav("login")}>OPERATOR LOGIN →</button>
      </div>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-4xl w-full">
          <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:0.8}}>
            <div className="tag tag-verified mb-6">
              <Radio size={10}/> PREDICTIVE INTELLIGENCE ACTIVE
            </div>
            <h1 className="text-5xl md:text-7xl font-light leading-none mb-6 tracking-[-0.03em]">
              <span className="text-[var(--text)]">Disaster</span><br/>
              <span className="text-[var(--accent)]">Graph Engine</span>
            </h1>
            <p className="text-lg font-light mb-10 max-w-xl text-[var(--muted)] leading-[1.7]">
              Cities modeled as live graphs. Bayesian report validation. BFS spread simulation.
              OR-Tools resource allocation. Self-improving via PostMortem learning.
            </p>
            <div className="flex gap-4 flex-wrap">
              <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="btn btn-primary" onClick={() => onNav("report")}>
                <Shield size={16}/> REPORT INCIDENT
              </motion.button>
              <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="btn btn-ghost" onClick={() => onNav("login")}>
                COMMAND CENTER <ArrowRight size={14}/>
              </motion.button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.6}} className="grid grid-cols-3 gap-4 mt-16">
            {[
              {icon:Activity,label:"BFS Simulation",val:"9 ticks",sub:"T+2h/T+4h/T+6h"},
              {icon:Zap,label:"Trust Scoring",val:"Bayesian",sub:"70+ threshold"},
              {icon:Shield,label:"Allocation",val:"Demand-driven",sub:"Severity-aware"},
            ].map(({icon:Icon,label,val,sub},i) => (
              <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.7+i*0.1}} className="panel p-5">
                <Icon size={16} className="mb-3 text-[var(--accent)]"/>
                <p className="mono text-xs mb-1 text-[var(--muted)]">{label}</p>
                <p className="text-base font-medium text-[var(--text)]">{val}</p>
                <p className="mono text-xs mt-1 text-[var(--muted)]">{sub}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Bottom */}
      <div className="px-8 py-4 border-t flex items-center justify-between border-[var(--border)]">
        <span className="mono text-xs text-[var(--muted)]">PDGE PLATFORM — PREDICTIVE DISASTER GRAPH ENGINE</span>
        <span className="mono text-xs text-[var(--muted)]">Mumbai NDRF District</span>
      </div>
    </div>
  );
}
