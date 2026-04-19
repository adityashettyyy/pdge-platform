import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Settings, Bell, Shield, Database } from "lucide-react";

function Toggle({ label, desc, defaultOn }: { label:string; desc:string; defaultOn?:boolean }) {
  const [on, setOn] = useState(defaultOn ?? false);
  return (
    <div className="flex items-center justify-between py-4 border-b border-border">
      <div>
        <p className="text-sm text-text">{label}</p>
        <p className="mono text-xs mt-0.5 text-muted">{desc}</p>
      </div>
      <button onClick={()=>setOn(!on)} className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${on ? "bg-accent" : "bg-border"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${on ? "right-0.5" : "left-0.5"} bg-white`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={16} className="text-accent" />
        <h1 className="text-xl font-light text-text">System Settings</h1>
      </div>

      {/* User info */}
      <div className="panel p-5">
        <p className="mono text-xs mb-4 text-muted">OPERATOR PROFILE</p>
        <div className="grid grid-cols-2 gap-4 mono text-sm">
          <div>
            <p className="text-muted">Name</p>
            <p className="text-text">{user?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted">Role</p>
            <p className="text-accent">{user?.role ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted">Email</p>
            <p className="text-text">{user?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted">Org ID</p>
            <p className="text-text truncate">{user?.organizationId?.slice(0,12)??""}</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={13} className="text-accent" />
          <p className="mono text-xs text-text">NOTIFICATIONS</p>
        </div>
        <Toggle label="Critical incident alerts" desc="Alert on trust score ≥ 70" defaultOn />
        <Toggle label="Plan approval reminders" desc="Notify when plan expires within 5 min" defaultOn />
        <Toggle label="PostMortem reports" desc="Weekly accuracy report" />
      </div>

      {/* System */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <Database size={13} className="text-accent" />
          <p className="mono text-xs text-text">SYSTEM</p>
        </div>
        <Toggle label="Auto-block edges" desc="Block roads adjacent to risk=1.0 nodes" defaultOn />
        <Toggle label="PostMortem learning" desc="Update spread coefficient after incidents" defaultOn />
        <Toggle label="Debug logging" desc="Verbose logs in workers" />
      </div>

      {/* Info */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={13} className="text-accent" />
          <p className="mono text-xs text-text">SYSTEM INFO</p>
        </div>
        <div className="grid grid-cols-2 gap-y-3 mono text-xs">
          {[["Version","2.0.0"],["Backend","Node.js + Express"],["AI","Claude claude-sonnet-4-6"],["Database","PostgreSQL + Prisma 6"],["Queue","BullMQ + Redis"],["Optimizer","Python + OR-Tools + NetworkX"]].map(([k,v]) => (
            <div key={k}>
              <p className="text-muted">{k}</p>
              <p className="text-text">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
