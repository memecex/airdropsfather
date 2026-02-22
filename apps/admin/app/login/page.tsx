"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL!;
      if (!base) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");

      const res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem("af_admin_token", data.token);
      localStorage.setItem("af_must_change_password", String(!!data.mustChangePassword));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Login error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">AirdropsFather Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Sign in to manage giveaways and templates.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm">Username</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="text-sm">Password</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black text-white py-2 disabled:opacity-50"
            type="submit"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
