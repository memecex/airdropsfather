"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../_api";

async function adminFetch(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem("admin_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function GiveawaysPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminFetch("/admin/giveaways");
        setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setErr(e?.message || "Failed");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Giveaways</h1>
        <a href="/dashboard/giveaways/new" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)" }}>
          + New Giveaway
        </a>
      </div>

      {err && <pre style={{ marginTop: 12 }}>{err}</pre>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>ID</th><th>Title</th><th>Status</th><th>Winners</th><th>X Post</th><th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: 10 }}>{r.id}</td>
                <td style={{ padding: 10 }}>
                  <a href={`/dashboard/giveaways/${r.id}`} style={{ textDecoration: "underline" }}>{r.title}</a>
                </td>
                <td style={{ padding: 10 }}>{r.status}</td>
                <td style={{ padding: 10 }}>{r.winners_count}</td>
                <td style={{ padding: 10, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.x_post_url}
                </td>
                <td style={{ padding: 10 }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 12, opacity: 0.8 }}>No giveaways yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
