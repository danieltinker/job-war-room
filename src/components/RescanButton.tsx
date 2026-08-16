"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RescanButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "queued">("idle");

  async function run() {
    setState("busy");
    const res = await fetch("/api/email/rescan", { method: "POST" });
    setState(res.ok ? "queued" : "idle");
    setTimeout(() => {
      setState("idle");
      router.refresh();
    }, 4000);
  }

  return (
    <button
      className="btn"
      onClick={run}
      disabled={state !== "idle"}
      title="Re-read the last 30 days of email with the current rules — catches applications you made before tracking existed"
    >
      {state === "queued" ? "Queued ✓" : state === "busy" ? "…" : "Rescan inbox (30d)"}
    </button>
  );
}
