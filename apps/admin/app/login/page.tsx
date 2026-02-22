"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://api-production-0b1bd.up.railway.app";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123123");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Admin Login</h1>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          AirdropsFather Admin Panel
        </div>

        {err && (
          <pre style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>
            {err}
          </pre>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
              autoComplete="username"
            />
          </label>

          <label style={{ fontSize: 12, opacity: 0.8 }}>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 6 }}
              autoComplete="current-password"
            />
          </label>

          <button
            disabled={loading}
            onClick={async () => {
              try {
                setLoading(true);
                setErr(null);

                const res = await fetch(`${API_BASE}/auth/login`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username, password }),
                });

                if (!res.ok) {
                  const t = await res.text().catch(() => "");
                  throw new Error(`${res.status} ${t}`);
                }

                const data = await res.json();
                if (!data?.token) throw new Error("No token returned");

                // ✅ MUST match _api.ts
                localStorage.setItem("admin_token", data.token);

                window.location.href = "/dashboard";
              } catch (e: any) {
                setErr(e?.message || "Login failed");
              } finally {
                setLoading(false);
              }
            }}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.16)",
              fontWeight: 800,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <button
            onClick={() => {
              localStorage.removeItem("admin_token");
              setErr("Token cleared.");
            }}
            style={{
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              opacity: 0.9,
            }}
          >
            Clear token
          </button>
        </div>
      </div>
    </div>
  );
}
