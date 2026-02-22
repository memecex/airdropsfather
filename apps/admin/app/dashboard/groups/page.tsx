"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../_api";

type Row = {
  telegram_chat_id: number;
  title: string | null;
  updated_at: string;
};

export default function GroupsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const res = await adminFetch("/admin/tg/groups");
      if (!res.ok) {
        setErr(`Failed: ${res.status}`);
        return;
      }
      setRows(await res.json());
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Telegram Groups</h1>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

      <div className="mt-6 overflow-auto rounded-2xl border">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Chat ID</th>
              <th className="p-3 text-left">Title</th>
              <th className="p-3 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.telegram_chat_id} className="border-t">
                <td className="p-3">{r.telegram_chat_id}</td>
                <td className="p-3">{r.title || "-"}</td>
                <td className="p-3">{new Date(r.updated_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3" colSpan={3}>No groups yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
