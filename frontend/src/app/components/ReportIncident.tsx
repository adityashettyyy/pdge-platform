import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Loader, AlertTriangle } from "lucide-react";
import { useApiMutation } from "../hooks/useApi";
import { reportIncident } from "../lib/endpoints";
import type { DisasterType, ReportResponse } from "../lib/types";

const TYPES: DisasterType[] = ["FLOOD","FIRE","EARTHQUAKE","CYCLONE","LANDSLIDE","CHEMICAL"];
const NODES = [
  {id:"node-zone-beta",label:"Zone Beta (Kurla)"},
  {id:"node-zone-g",label:"Zone G (Ghatkopar)"},
  {id:"node-zone-d",label:"Zone D (Dharavi)"},
  {id:"node-zone-a",label:"Zone A (Andheri)"},
  {id:"node-zone-c",label:"Zone C (Chembur)"},
  {id:"node-hosp-m",label:"Municipal Hospital"},
  {id:"node-hosp-k",label:"KEM Hospital"},
  {id:"node-depot-n",label:"North Depot"},
];
const LAT_LNG: Record<string,[number,number]> = {
  "node-zone-beta":[19.072,72.88],"node-zone-g":[19.086,72.908],"node-zone-d":[19.04,72.858],
  "node-zone-a":[19.1197,72.8464],"node-zone-c":[19.0622,72.9005],"node-hosp-m":[19.045,72.862],
  "node-hosp-k":[18.99,72.834],"node-depot-n":[19.12,72.865],
};

export default function ReportIncident() {
  const [type, setType] = useState<DisasterType|"">("");
  const [node, setNode] = useState("");
  const [gps, setGps] = useState(true);
  const [desc, setDesc] = useState("");
  const [result, setResult] = useState<ReportResponse|null>(null);
  const { mutate, loading, error } = useApiMutation(reportIncident, r => setResult(r));

  const submit = () => {
    if (!type || !node) return;
    const [lat,lng] = LAT_LNG[node] ?? [19.076, 72.877];
    mutate({ type: type as DisasterType, latitude:lat, longitude:lng, originNodeId:node, gpsValid:gps, description:desc });
  };

  if (result) return (
    <div className="p-6 flex items-center justify-center min-h-96">
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} className="panel p-8 max-w-lg w-full text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 bg-accent-soft">
          <CheckCircle size={24} className="text-accent" />
        </div>
        <h2 className="text-xl font-medium mb-2 text-text">Report Submitted</h2>
        <p className="text-sm mb-6 text-muted">Trust scoring queued. Watch the dashboard for verification.</p>
        <div className="p-4 rounded-lg mb-6 text-left space-y-2 bg-surface">
          <p className="mono text-xs text-muted">INCIDENT ID</p>
          <p className="mono text-sm text-accent">{result.incidentId}</p>
          <p className="mono text-xs mt-3 text-muted">INITIAL TRUST SCORE</p>
          <div className="flex items-center gap-3">
            <progress value={result.trustScore} max={100} className="flex-1 rounded-full" />
            <span className="mono text-xs text-accent">{result.trustScore}/100</span>
          </div>
          <p className="mono text-xs mt-1 text-muted">Need 70+ to trigger simulation. Submit more reports to corroborate.</p>
        </div>
        <button className="btn btn-ghost w-full justify-center" onClick={() => { setResult(null); setType(""); setNode(""); setDesc(""); }}>Submit another report</button>
      </motion.div>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-text">Report Incident</h1>
        <p className="text-sm mt-1 text-muted">Each report adds to the Bayesian trust score. At 70+, simulation triggers automatically.</p>
      </div>

      <div className="panel p-6 space-y-6">
        {/* Disaster type */}
        <div>
          <p className="mono text-xs mb-3 text-muted">DISASTER TYPE</p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(t => {
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`p-3 rounded-lg text-sm transition-all border ${active ? "bg-accent-soft border-accent text-accent" : "bg-surface border-border text-muted"}`}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Location */}
        <div>
          <p className="mono text-xs mb-3 text-muted">NEAREST CITY NODE</p>
          <div className="grid grid-cols-2 gap-2">
            {NODES.map(n => {
              const active = node === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setNode(n.id)}
                  className={`p-3 rounded-lg text-sm text-left transition-all border ${active ? "bg-accent-soft border-accent text-accent" : "bg-surface border-border text-muted"}`}>
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* GPS */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGps(!gps)}
            className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${gps ? "bg-accent" : "bg-border"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${gps ? "right-0.5" : "left-0.5"} bg-white`} />
          </button>
          <div>
            <p className="text-sm text-text">GPS valid</p>
            <p className="mono text-xs text-muted">+25 trust score points when enabled</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="mono text-xs mb-3 text-muted">DESCRIPTION (OPTIONAL)</p>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Describe the situation — water levels, fire spread, structural damage…"
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Review */}
        {type && node && (
          <div className="p-4 rounded-lg bg-surface">
            <p className="mono text-xs mb-2 text-muted">REVIEW</p>
            <div className="grid grid-cols-3 gap-2 mono text-xs text-text">
              <span>
                Type: <span className="text-accent">{type}</span>
              </span>
              <span>
                GPS: <span className={gps ? "text-accent" : "text-muted"}>{gps ? "+25pts" : "no bonus"}</span>
              </span>
              <span>
                Score est: <span className="text-accent">{30 + (gps ? 25 : 0)}/100</span>
              </span>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={submit}
          disabled={loading || !type || !node}
          className={`btn btn-primary w-full justify-center ${loading || !type || !node ? "opacity-50" : ""}`}>
          {loading ? (
            <>
              <Loader size={14} className="animate-spin" />SUBMITTING…
            </>
          ) : (
            <>
              <AlertTriangle size={14} />SUBMIT REPORT
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
