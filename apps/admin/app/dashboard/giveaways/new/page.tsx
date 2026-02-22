"use client";

import { useState } from "react";
import { API_BASE } from "../../_api";

async function adminFetch(path: string, body: any) {
  const token = localStorage.getItem("admin_token");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function NewGiveawayPage() {
  const [title, setTitle] = useState("");
  const [xAccount, setXAccount] = useState("@AirdropsFather");
  const [xPostUrl, setXPostUrl] = useState("");
  const [winners, setWinners] = useState(3);
  const [tgChatId, setTgChatId] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ padding: 16, maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>New Giveaway</h1>

      {err && <pre style={{ marginTop: 10 }}>{err}</pre>}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <label>Title<br />
          <input value={title} onChange={e=>setTitle(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10 }} />
        </label>

        <label>Description<br />
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, minHeight: 90 }} />
        </label>

        <label>X Account (your handle)<br />
          <input value={xAccount} onChange={e=>setXAccount(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10 }} />
        </label>

        <label>X Post URL<br />
          <input value={xPostUrl} onChange={e=>setXPostUrl(e.target.value)} placeholder="https://x.com/..../status/..." style={{ width: "100%", padding: 10, borderRadius: 10 }} />
        </label>

        <label>Winners Count<br />
          <input type="number" value={winners} onChange={e=>setWinners(Number(e.target.value))} style={{ width: "100%", padding: 10, borderRadius: 10 }} />
        </label>

        <label>Telegram Chat ID (optional)<br />
          <input value={tgChatId} onChange={e=>setTgChatId(e.target.value)} placeholder="-100..." style={{ width: "100%", padding: 10, borderRadius: 10 }} />
        </label>

        <button
          onClick={async () => {
            try {
              setErr(null);
              const g = await adminFetch("/admin/giveaways", {
                title, description: desc, x_account: xAccount, x_post_url: xPostUrl, winners_count: winners,
                tg_chat_id: tgChatId ? Number(tgChatId) : null
              });
              window.location.href = `/dashboard/giveaways/${g.id}`;
            } catch (e: any) {
              setErr(e?.message || "Failed");
            }
          }}
          style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)" }}
        >
          Create
        </button>
      </div>
    </div>
  );
}
