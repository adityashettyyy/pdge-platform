import { useState, useEffect, useCallback, useRef } from "react";
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick(n => n+1), []);
  useEffect(() => {
    let gone = false;
    setLoading(true); setError(null);
    fn().then(r => { if (!gone) { setData(r); setLoading(false); } })
        .catch(e => { if (!gone) { setError(e instanceof Error ? e.message : "Error"); setLoading(false); } });
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, loading, error, refetch };
}
export function useApiMutation<TArgs, TResult=unknown>(fn:(args:TArgs)=>Promise<TResult>, onSuccess?:(r:TResult)=>void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reset = useCallback(() => { setError(null); setSuccess(false); }, []);
  const mutate = useCallback(async (args:TArgs) => {
    setLoading(true); setError(null); setSuccess(false);
    try {
      const r = await fn(args);
      if (mounted.current) { setSuccess(true); setLoading(false); onSuccess?.(r); }
    } catch(e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : "Error"); setLoading(false); }
    }
  }, [fn, onSuccess]);
  return { mutate, loading, error, success, reset };
}
