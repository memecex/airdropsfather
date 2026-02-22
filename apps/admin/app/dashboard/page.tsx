"use client";

import { useEffect, useMemo, useState } from "react";
import { adminGetUsers, adminGetGroups } from "./_api";

type UserRow = {
  telegram_user_id: number;
  telegram_username: string | null;
  x_handle: string | null;
  dm_opt_in: boolean;
  dm_pref: string;
  is_verified?: number;
  created_at?: string;
  updated_at?: string;
};

type GroupRow = {
  telegram_chat_id: number;
  title: string | null;
  created_at?: string;
  updated_at?: string;
};

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 14,
        background: "rgba(255,255,255,0.03)",
        minHeight: 88,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      {children}
    </span>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 360;
  const h = 96;
  const pad = 10;
  const bw = Math.max(6, Math.floor((w - pad * 2) / (values.length * 1.7)));
  const gap = Math.floor(bw * 0.6);

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <rect x="0" y="0" width={w} height={h} rx="14" ry="14" fill="rgba(255,255,255,0.03)" />
      {values.map((v, i) => {
        const barH = Math.round(((h - pad * 2) * v) / max);
        const x = pad + i * (bw + gap);
        const y = h - pad - barH;
        return (
          <rect key={i} x={x} y={y} width={bw} height={barH} rx="6" ry="6" fill="rgba(255,255,255,0.28)" />
        );
      })}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.14)" />
    </svg>
  );
}

function byDayISO(d: Date) {
  // YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function DashboardPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [u, g] = await Promise.all([adminGetUsers(), adminGetGroups()]);
        if (!mounted) return;

        setUsers(Array.isArray(u) ? (u as UserRow[]) : []);
        setGroups(Array.isArray(g) ? (g as GroupRow[]) : []);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load dashboard data");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const kpis = useMemo(() => {
    const totalUsers = users.length;
    const verifiedUsers = users.filter(
      (u) => Number(u.is_verified) === 1 || (!!u.telegram_username && !!u.x_handle)
    ).length;

    const optInUsers = users.filter((u) => u.dm_opt_in === true).length;
    const importantPref = users.filter((u) => (u.dm_pref || "").toUpperCase() === "IMPORTANT").length;

    const totalGroups = groups.length;

    // activity: users updated in last 24h / 7d
    const now = Date.now();
    const d24 = now - 24 * 60 * 60 * 1000;
    const d7 = now - 7 * 24 * 60 * 60 * 1000;

    const active24 = users.filter((u) => (u.updated_at ? new Date(u.updated_at).getTime() : 0) >= d24).length;
    const active7 = users.filter((u) => (u.updated_at ? new Date(u.updated_at).getTime() : 0) >= d7).length;

    return {
      totalUsers,
      verifiedUsers,
      optInUsers,
      importantPref,
      totalGroups,
      active24,
      active7,
    };
  }, [users, groups]);

  const chart7d = useMemo(() => {
    // last 7 days updates count
    const map = new Map<string, number>();
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      map.set(byDayISO(d), 0);
    }

    for (const u of users) {
      if (!u.updated_at) continue;
      const day = byDayISO(new Date(u.updated_at));
      if (map.has(day)) map.set(day, (map.get(day) || 0) + 1);
    }

    return Array.from(map.values());
  }, [users]);

  const recentUsers = useMemo(() => {
    return [...users]
      .sort((a, b) => (b.updated_at ? new Date(b.updated_at).getTime() : 0) - (a.updated_at ? new Date(a.updated_at).getTime() : 0))
      .slice(0, 8);
  }, [users]);

  const recentGroups = useMemo(() => {
    return [...groups]
      .sort((a, b) => (b.updated_at ? new Date(b.updated_at).getTime() : 0) - (a.updated_at ? new Date(a.updated_at).getTime() : 0))
      .slice(0, 6);
  }, [groups]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.4, margin: 0 }}>Dashboard</h1>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>AirdropsFather Admin Overview</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill>Users: <b>{kpis.totalUsers}</b></Pill>
          <Pill>Verified: <b>{kpis.verifiedUsers}</b></Pill>
          <Pill>Groups: <b>{kpis.totalGroups}</b></Pill>
        </div>
      </div>

      {loading && <p style={{ marginTop: 12, opacity: 0.8 }}>Loading…</p>}
      {err && (
        <pre style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>
          {err}
        </pre>
      )}

      {!loading && !err && (
        <>
          {/* KPI grid */}
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
            }}
          >
            <Card title="Total Users" value={String(kpis.totalUsers)} sub="All telegram users in DB" />
            <Card title="Verified Users" value={String(kpis.verifiedUsers)} sub="tg_username + x_handle present" />
            <Card title="DM Opt-in" value={String(kpis.optInUsers)} sub="Users who allowed DMs" />
            <Card title="Important Pref" value={String(kpis.importantPref)} sub="DM preference IMPORTANT" />
            <Card title="Groups" value={String(kpis.totalGroups)} sub="Registered groups" />
            <Card title="Active Users" value={`${kpis.active24} / ${kpis.active7}`} sub="Updated in 24h / 7d" />
          </div>

          {/* Charts + recents */}
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>User Updates (Last 7 days)</div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>counts by updated_at</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <MiniBars values={chart7d} />
              </div>
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontWeight: 800 }}>Recent Users</div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                      <th style={{ padding: "8px 6px" }}>TG</th>
                      <th style={{ padding: "8px 6px" }}>X</th>
                      <th style={{ padding: "8px 6px" }}>Verified</th>
                      <th style={{ padding: "8px 6px" }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentUsers.map((u) => {
                      const v = Number(u.is_verified) === 1 || (!!u.telegram_username && !!u.x_handle);
                      return (
                        <tr key={String(u.telegram_user_id)} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "8px 6px" }}>{u.telegram_username ? `@${u.telegram_username}` : "—"}</td>
                          <td style={{ padding: "8px 6px" }}>{u.x_handle || "—"}</td>
                          <td style={{ padding: "8px 6px" }}>{v ? "1" : "0"}</td>
                          <td style={{ padding: "8px 6px", opacity: 0.75 }}>
                            {u.updated_at ? new Date(u.updated_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {recentUsers.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: 10, opacity: 0.7 }}>No users yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontWeight: 800 }}>Recent Groups</div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                      <th style={{ padding: "8px 6px" }}>Title</th>
                      <th style={{ padding: "8px 6px" }}>Chat ID</th>
                      <th style={{ padding: "8px 6px" }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentGroups.map((g) => (
                      <tr key={String(g.telegram_chat_id)} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "8px 6px" }}>{g.title || "—"}</td>
                        <td style={{ padding: "8px 6px" }}>{g.telegram_chat_id}</td>
                        <td style={{ padding: "8px 6px", opacity: 0.75 }}>
                          {g.updated_at ? new Date(g.updated_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                    {recentGroups.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: 10, opacity: 0.75 }}>
                          No groups yet. Add the bot to a group (preferably as admin) then remove+add again to trigger registration.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
