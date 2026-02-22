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
      <p className="mt-4 text-sm text-gray-600">
        Next: Giveaways, Templates, Integrations, Analytics.
      </p>
    </div>
  );
}
