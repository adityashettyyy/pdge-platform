const BASE = import.meta.env.VITE_API_URL ?? "/api";
let _token: string | null = localStorage.getItem("pdge_token");
export const token = {
  get: () => _token,
  set: (t: string) => { _token = t; localStorage.setItem("pdge_token", t); },
  clear: () => { _token = null; localStorage.removeItem("pdge_token"); },
  exists: () => Boolean(_token),
};
async function req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 401) { token.clear(); window.location.href = "/"; throw new Error("Session expired"); }
  if (res.status === 204) return null as T;
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  if (json && "success" in json && json.success === true) return json.data as T;
  return json as T;
}
export const api = {
  get: <T>(path: string) => req<T>(path, "GET"),
  post: <T>(path: string, body?: unknown) => req<T>(path, "POST", body),
  patch: <T>(path: string, body?: unknown) => req<T>(path, "PATCH", body),
  delete: <T>(path: string) => req<T>(path, "DELETE"),
};
