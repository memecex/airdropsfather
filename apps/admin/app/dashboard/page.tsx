"use client";

export default function DashboardPage() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("af_admin_token") : null;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-gray-600">
        API Token present: <b>{token ? "YES" : "NO"}</b>
      </p>

      <div className="mt-6 flex gap-3 flex-wrap">
        <a className="rounded-xl border px-4 py-2" href="/dashboard/users">Telegram Users</a>
        <a className="rounded-xl border px-4 py-2" href="/dashboard/groups">Telegram Groups</a>
        <a className="rounded-xl border px-4 py-2" href="/dashboard/broadcast">Broadcast</a>
      </div>
    </div>
  );
}
