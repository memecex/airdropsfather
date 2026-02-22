"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../_api";

type Row = {
  id: number;
  title: string;
  status: string;
  winners_count: number;
  x_account: string;
  x_post_url: string;
  tg_chat_id: number | null;
  updated_at?: string;
};

export default function GiveawaysListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const data = await adminFetch("/admin/giveaways", { method: "GET" });
      setRows(Array.isArray(data) ? (data as Row[]) : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load giveaways");
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Giveaways</h1>
        <button onClick={load} style={btn()}>Refresh</button>
      </div>

      {err && <pre style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>{err}</pre>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <th style={{ padding: 10 }}>ID</th>
              <th style={{ padding: 10 }}>Title</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Winners</th>
              <th style={{ padding: 10 }}>X</th>
              <th style={{ padding: 10 }}>TG Chat</th>
              <th style={{ padding: 10 }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: 10 }}>
                  <a href={`/dashboard/giveaways/${r.id}`} style={{ fontWeight: 900 }}>{r.id}</a>
                </td>
                <td style={{ padding: 10, fontWeight: 800 }}>{r.title}</td>
                <td style={{ padding: 10 }}>{r.status}</td>
                <td style={{ padding: 10 }}>{r.winners_count}</td>
                <td style={{ padding: 10 }}>
                  <div style={{ fontWeight: 800 }}>{r.x_account}</div>
                  <div style={{ fontSize: 12, opacity: 0.75, wordBreak: "break-all" }}>{r.x_post_url}</div>
                </td>
                <td style={{ padding: 10 }}>{r.tg_chat_id ? String(r.tg_chat_id) : "—"}</td>
                <td style={{ padding: 10, opacity: 0.75 }}>
                  {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 12, opacity: 0.8 }}>No giveaways yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function btn() {
  return { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)" } as any;
}
