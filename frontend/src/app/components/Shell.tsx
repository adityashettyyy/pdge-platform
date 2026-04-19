import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, AlertTriangle, Package, Map, BarChart3, Settings, Brain, Home, ChevronLeft, ChevronRight, Bell, Clock, Wifi, WifiOff, LogOut, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Dashboard from "./Dashboard";
import LiveMap from "./LiveMap";
import ReportIncident from "./ReportIncident";
import Resources from "./Resources";
import Analytics from "./Analytics";
import Commander from "./Commander";
import SettingsPage from "./SettingsPage";

const NAV = [
  {id:"dashboard",label:"Dashboard",icon:LayoutDashboard},
  {id:"map",label:"Live Map",icon:Map},
  {id:"report",label:"Report",icon:AlertTriangle},
  {id:"resources",label:"Resources",icon:Package},
  {id:"analytics",label:"Analytics",icon:BarChart3},
  {id:"commander",label:"AI Commander",icon:Brain},
  {id:"settings",label:"Settings",icon:Settings},
];

interface Props { page:string; onNav:(p:string)=>void; sysStatus:"normal"|"critical"; wsConnected:boolean; }

export default function Shell({ page, onNav, sysStatus, wsConnected }: Props) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [time] = useState(() => {
    const t = setInterval(() => {}, 1000);
    clearInterval(t);
    return new Date();
  });
  const [now, setNow] = useState(new Date());
  useState(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); });

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--void)]">
      {/* Sidebar */}
      <motion.aside animate={{width:collapsed?64:220}} transition={{duration:0.2,ease:"easeInOut"}} className="flex flex-col border-r flex-shrink-0 border-[var(--border)] bg-[var(--surface)]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[var(--border)] min-h-[64px]">
          <div className="w-7 h-7 rounded flex-shrink-0 flex items-center justify-center bg-[var(--accent)]">
            <AlertTriangle size={14} className="text-[var(--void)]"/>
          </div>
          {!collapsed && <div><p className="mono text-xs font-medium text-[var(--accent)]">PDGE</p><p className="mono text-xs text-[var(--muted)]">v2.0</p></div>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({id,label,icon:Icon}) => {
            const active = page === id;
            return (
              <button key={id} onClick={() => onNav(id)} title={collapsed?label:undefined} className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all ${active ? "text-[var(--accent)] bg-[rgba(0,255,178,0.06)] border-l-2 border-[var(--accent)]" : "text-[var(--muted)] border-l-2 border-transparent"}`}>
                <Icon size={15} className="flex-shrink-0"/>
                {!collapsed && <span className="text-sm">{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-[var(--border)] p-3">
          {!collapsed && user && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-[rgba(0,255,178,0.1)]">
                <User size={11} className="text-[var(--accent)]"/>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate text-[var(--text)]">{user.name}</p>
                <p className="mono text-xs text-[var(--muted)]">{user.role}</p>
              </div>
            </div>
          )}
          <button onClick={() => { logout(); onNav("landing"); }} title="Logout" className="w-full flex items-center gap-2 px-2 py-2 rounded text-xs transition-all text-[var(--muted)] hover:text-[var(--danger)]">
            <LogOut size={13}/>{!collapsed && "Logout"}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded mt-1 text-xs transition-all text-[var(--muted)] hover:text-[var(--accent)]">
            {collapsed ? <ChevronRight size={13}/> : <><ChevronLeft size={13}/><span>Collapse</span></>}
          </button>
        </div>
      </motion.aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 border-b flex-shrink-0 h-16 border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${sysStatus === "critical" ? "bg-[var(--danger)] shadow-[0_0_8px_var(--danger)]" : "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"}`} />
              <span className={`mono text-xs ${sysStatus === "critical" ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                {sysStatus==="critical"?"CRITICAL ALERT":"ALL SYSTEMS NORMAL"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mono text-xs text-[var(--muted)]">
              {wsConnected ? <><Wifi size={11} className="text-[var(--accent)]"/><span className="text-[var(--accent)]">LIVE</span></> : <><WifiOff size={11} className="text-[var(--danger)]"/><span className="text-[var(--danger)]">OFFLINE</span></>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mono text-xs text-[var(--muted)]">
              <Clock size={11}/>{now.toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit"})} IST
            </div>
            <button className="relative text-[var(--muted)]">
              <Bell size={16}/>
            </button>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto bg-[var(--void)]">
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.15}} className="h-full">
              {page==="dashboard"  && <Dashboard />}
              {page==="map"        && <LiveMap />}
              {page==="report"     && <ReportIncident />}
              {page==="resources"  && <Resources />}
              {page==="analytics"  && <Analytics />}
              {page==="commander"  && <Commander />}
              {page==="settings"   && <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
