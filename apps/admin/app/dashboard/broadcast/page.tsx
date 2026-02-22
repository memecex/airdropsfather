"use client";

import { useState } from "react";
import { adminFetch } from "../_api";

export default function BroadcastPage() {
  const [audience, setAudience] = useState<"ALL" | "IMPORTANT">("ALL");
  const [limit, setLimit] = useState(200);
  const [message, setMessage] = useState("🚀 New giveaway is live! Check the pinned post in the group.");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await adminFetch("/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({ message, audience, limit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`Failed: ${res.status} ${data?.error || ""}`);
        return;
      }
      setStatus(`OK. Selected ${data.selected}. Delivered ok=${data.delivery?.ok} fail=${data.delivery?.fail}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Broadcast DM</h1>
      <p className="mt-2 text-sm text-gray-600">Sends a DM to opted-in users who started the bot.</p>

      <div className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm">Audience</label>
          <select
            className="rounded-xl border px-3 py-2"
            value={audience}
            onChange={(e) => setAudience(e.target.value as any)}
          >
            <option value="ALL">ALL (dm_opt_in=true)</option>
            <option value="IMPORTANT">IMPORTANT only (dm_pref=IMPORTANT)</option>
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Limit</label>
          <input
            className="rounded-xl border px-3 py-2"
            type="number"
            min={1}
            max={2000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Message</label>
          <textarea
            className="rounded-xl border px-3 py-2 min-h-[140px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <button
          onClick={send}
          disabled={loading}
          className="rounded-xl bg-black text-white py-2 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Broadcast"}
        </button>

        {status && <div className="text-sm">{status}</div>}
      </div>
    </div>
  );
}
