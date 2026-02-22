export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://api-production-0b1bd.up.railway.app";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function adminGetUsers() {
  return apiFetch("/admin/tg/users", { method: "GET" });
}

export async function adminGetGroups() {
  return apiFetch("/admin/tg/groups", { method: "GET" });
}
