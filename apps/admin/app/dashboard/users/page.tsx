"use client";

import { useEffect, useState } from "react";
import { adminGetUsers } from "../_api";

type Row = {
  telegram_user_id: number;
  telegram_username: string | null;
  x_handle: string | null;
  dm_opt_in: boolean;
  dm_pref: string;
  is_verified: boolean;
  onboarding_dm_set: boolean;
  onboarding_done: boolean;
  updated_at?: string;
};

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminGetUsers();
        setRows(Array.isArray(data) ? (data as Row[]) : []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load users");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>Users</h1>
      {err && <pre style={{ marginTop: 12 }}>{err}</pre>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <th style={{ padding: 10 }}>Verified</th>
              <th style={{ padding: 10 }}>Onboarding</th>
              <th style={{ padding: 10 }}>TG</th>
              <th style={{ padding: 10 }}>X</th>
              <th style={{ padding: 10 }}>DM</th>
              <th style={{ padding: 10 }}>Pref</th>
              <th style={{ padding: 10 }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.telegram_user_id)} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: 10 }}>{r.is_verified ? "1" : "0"}</td>
                <td style={{ padding: 10 }}>{r.onboarding_done ? "DONE" : (r.onboarding_dm_set ? "DM_SET" : "NEW")}</td>
                <td style={{ padding: 10 }}>
                  {r.telegram_username ? `@${r.telegram_username}` : "—"}
                  <div style={{ fontSize: 12, opacity: 0.7 }}>ID: {r.telegram_user_id}</div>
                </td>
                <td style={{ padding: 10 }}>{r.x_handle || "—"}</td>
                <td style={{ padding: 10 }}>{r.dm_opt_in ? "true" : "false"}</td>
                <td style={{ padding: 10 }}>{r.dm_pref || "ALL"}</td>
                <td style={{ padding: 10, opacity: 0.75 }}>
                  {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 12, opacity: 0.8 }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
