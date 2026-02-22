export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
  return base;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("af_admin_token");
}

export async function adminFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as any),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  return res;
}
