"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunNowButton({ kind, label }: { kind: "scrape" | "email" | "digest"; label: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "queued">("idle");

  async function run() {
    setState("busy");
    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setState(res.ok ? "queued" : "idle");
    setTimeout(() => {
      setState("idle");
      router.refresh();
    }, 4000);
  }

  return (
    <button className="btn" onClick={run} disabled={state !== "idle"}>
      {state === "queued" ? "Queued ✓" : state === "busy" ? "…" : label}
    </button>
  );
}
