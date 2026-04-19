import { useEffect, useRef, useState, useCallback } from "react";
import { token } from "../lib/api";
import type { WsEvent, WsEventType } from "../lib/types";
const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/ws";
interface Opts {
  orgId:string; enabled?:boolean;
  onInitialState?:(p:any)=>void; onEdgeBlocked?:(p:any)=>void;
  onRiskSpike?:(p:any)=>void; onSimulationComplete?:(p:any)=>void; onAllocationApproved?:(p:any)=>void;
}
export function useWebSocket(opts:Opts) {
  const { orgId, enabled=true, onInitialState, onEdgeBlocked, onRiskSpike, onSimulationComplete, onAllocationApproved } = opts;
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket|null>(null);
  const retries = useRef(0);
  const mounted = useRef(true);
  const dispatch = useCallback((msg:WsEvent) => {
    switch(msg.type as WsEventType) {
      case "INITIAL_STATE": onInitialState?.(msg.payload); break;
      case "EDGE_BLOCKED": onEdgeBlocked?.(msg.payload); break;
      case "RISK_SPIKE": onRiskSpike?.(msg.payload); break;
      case "SIMULATION_COMPLETE": onSimulationComplete?.(msg.payload); break;
      case "ALLOCATION_APPROVED": onAllocationApproved?.(msg.payload); break;
    }
  }, [onInitialState, onEdgeBlocked, onRiskSpike, onSimulationComplete, onAllocationApproved]);
  const connect = useCallback(() => {
    if (!enabled || !orgId || !mounted.current) return;
    const t = token.get();
    const ws = new WebSocket(`${WS_BASE}?orgId=${encodeURIComponent(orgId)}${t ? `&token=${t}` : ""}`);
    wsRef.current = ws;
    ws.onopen = () => { if (!mounted.current) return; setConnected(true); retries.current = 0; };
    ws.onclose = () => {
      if (!mounted.current) return;
      setConnected(false);
      if (retries.current < 5) { const d = 1000 * Math.pow(2, retries.current++); setTimeout(connect, d); }
    };
    ws.onmessage = (e) => { try { dispatch(JSON.parse(e.data)); } catch {} };
  }, [enabled, orgId, dispatch]);
  useEffect(() => { mounted.current = true; if (enabled && orgId) connect(); return () => { mounted.current = false; wsRef.current?.close(); }; }, [connect, enabled, orgId]);
  return { connected };
}
