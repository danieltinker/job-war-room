"use client";

import { useCallback, useEffect, useState } from "react";

interface WaState {
  status: string;
  desired: string;
  qr: string | null;
  target: string | null;
}

export function WhatsAppPanel() {
  const [state, setState] = useState<WaState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/whatsapp").then((r) => r.json()).catch(() => null);
    if (data) setState(data);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function act(action: "connect" | "disconnect") {
    setBusy(true);
    await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    refresh();
  }

  if (!state) return <p className="text-sm text-slate-400">Loading WhatsApp status…</p>;

  const badge =
    state.status === "connected" ? (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
        ● Connected
      </span>
    ) : state.status === "waiting_qr" ? (
      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
        ● Waiting for scan
      </span>
    ) : (
      <span className="rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
        ○ Disconnected
      </span>
    );

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">💬 WhatsApp connection</h2>
        {badge}
      </div>
      <p className="text-sm text-slate-400">
        Links as a companion device to your own WhatsApp (like WhatsApp Web). You&apos;ll receive
        the daily brief, instant match alerts, and pipeline updates on your phone.
      </p>

      {state.status === "waiting_qr" && state.qr && (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="WhatsApp pairing QR" width={280} height={280} />
          <p className="text-center text-xs text-slate-600">
            WhatsApp → Settings → Linked devices → Link a device
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {state.status !== "connected" && state.desired !== "connected" && (
          <button className="btn btn-primary" onClick={() => act("connect")} disabled={busy}>
            Connect WhatsApp
          </button>
        )}
        {state.desired === "connected" && state.status !== "connected" && (
          <button className="btn" disabled>
            Starting… (QR appears here)
          </button>
        )}
        {(state.status === "connected" || state.desired === "connected") && (
          <button className="btn btn-danger" onClick={() => act("disconnect")} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>
      {!state.target && (
        <p className="text-xs text-amber-300">
          Set the digest target number below so messages know where to go.
        </p>
      )}
    </section>
  );
}
