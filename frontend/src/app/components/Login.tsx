import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, AlertCircle, Loader } from "lucide-react";
import { useAuth } from "../context/AuthContext";
interface Props { onSuccess:()=>void; onBack:()=>void; }
export default function Login({ onSuccess, onBack }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const submit = async (e:React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Both fields required"); return; }
    setLoading(true); setError(null);
    try { await login(email, password); onSuccess(); }
    catch(err) { setError(err instanceof Error ? err.message : "Login failed"); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen grid-bg flex items-center justify-center bg-[var(--void)]">
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full max-w-md p-8 panel">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded flex items-center justify-center bg-[var(--accent)]">
            <Shield size={16} className="text-[var(--void)]"/>
          </div>
          <div>
            <p className="mono text-sm font-medium text-[var(--accent)]">PDGE</p>
            <p className="mono text-xs text-[var(--muted)]">COMMAND CENTER ACCESS</p>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg mb-5 bg-[rgba(255,51,102,0.08)] border border-[rgba(255,51,102,0.2)]">
            <AlertCircle size={14} className="text-[var(--danger)]"/><span className="text-sm text-[var(--danger)]">{error}</span>
          </div>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="mono text-xs mb-2 block text-[var(--muted)]">EMAIL</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@pdge.local" autoComplete="email"/>
          </div>
          <div>
            <label className="mono text-xs mb-2 block text-[var(--muted)]">PASSWORD</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"/>
          </div>
          <motion.button whileTap={{scale:0.98}} type="submit" disabled={loading} className={`btn btn-primary w-full justify-center mt-2 ${loading ? "opacity-70" : "opacity-100"}`}>
            {loading ? <><Loader size={14} className="animate-spin"/>AUTHENTICATING</> : "ACCESS SYSTEM →"}
          </motion.button>
        </form>
        <button onClick={onBack} className="w-full text-center mt-5 text-xs text-[var(--muted)]">← back to home</button>
        <div className="mt-6 p-3 rounded bg-[rgba(0,255,178,0.04)] border border-[rgba(0,255,178,0.1)]">
          <p className="mono text-xs text-[var(--muted)]">Demo: admin@pdge.local / admin123</p>
        </div>
      </motion.div>
    </div>
  );
}
