"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "./_api";

export default function DashboardHome() {
  const [stats, setStats] = useState<{ users: number; groups: number; giveaways: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await adminFetch("/admin/stats", { method: "GET" });
        setStats(s);
      } catch (e: any) {
        setErr(e?.message || "Failed to load stats");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Admin Dashboard</h1>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>AirdropsFather Control Center</div>

      {err && <pre style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>{err}</pre>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
        <Card title="Users" value={stats ? String(stats.users) : "…"} href="/dashboard/users" />
        <Card title="Groups" value={stats ? String(stats.groups) : "…"} href="/dashboard/groups" />
        <Card title="Giveaways" value={stats ? String(stats.giveaways) : "…"} href="/dashboard/giveaways" />
        <Card title="Broadcast" value="Send" href="/dashboard/broadcast" />
      </div>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
        Tip: Add bot to groups and run <b>/groupid</b> to register them for JOIN_TG tasks.
      </div>
    </div>
  );
}

function Card({ title, value, href }: { title: string; value: string; href: string }) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 14,
        textDecoration: "none",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Open</div>
    </a>
  );
}
