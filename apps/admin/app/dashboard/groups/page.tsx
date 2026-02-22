"use client";

import { useEffect, useState } from "react";
import { adminGetGroups } from "../_api";

type GroupRow = {
  telegram_chat_id: number;
  title: string | null;
  updated_at?: string;
};

export default function GroupsPage() {
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminGetGroups();
        setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load groups");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Groups</h1>

      {err && <pre>{err}</pre>}

      {rows.length === 0 ? (
        <div style={{ marginTop: 20 }}>
          No groups found.
          <br /><br />
          Botu gruptan çıkarıp tekrar ekle.
          <br />
          Botu admin yapman önerilir.
        </div>
      ) : (
        <table style={{ width: "100%", marginTop: 20 }}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Chat ID</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.telegram_chat_id}>
                <td>{r.title || "-"}</td>
                <td>{r.telegram_chat_id}</td>
                <td>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
