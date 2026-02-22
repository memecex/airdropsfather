"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../_api";

type Row = {
  telegram_user_id: number;
  telegram_username: string | null;
  dm_opt_in: boolean;
  dm_pref: string;
  x_handle: string | null;
  updated_at: string;
};

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const res = await adminFetch("/admin/tg/users");
      if (!res.ok) {
        setErr(`Failed: ${res.status}`);
        return;
      }
      setRows(await res.json());
    })();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Telegram Users</h1>
        <a className="text-sm underline" href="/dashboard/broadcast">Send Broadcast</a>
      </div>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

      <div className="mt-6 overflow-auto rounded-2xl border">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">TG User ID</th>
              <th className="p-3 text-left">TG Username</th>
              <th className="p-3 text-left">Opt-in</th>
              <th className="p-3 text-left">Pref</th>
              <th className="p-3 text-left">X Handle</th>
              <th className="p-3 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.telegram_user_id} className="border-t">
                <td className="p-3">{r.telegram_user_id}</td>
                <td className="p-3">{r.telegram_username || "-"}</td>
                <td className="p-3">{r.dm_opt_in ? "true" : "false"}</td>
                <td className="p-3">{r.dm_pref}</td>
                <td className="p-3">{r.x_handle || "-"}</td>
                <td className="p-3">{new Date(r.updated_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3" colSpan={6}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
