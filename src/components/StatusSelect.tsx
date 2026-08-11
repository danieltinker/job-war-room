"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
  "APPLIED",
  "IN_REVIEW",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "GHOSTED",
] as const;

export function StatusSelect({
  applicationId,
  value,
}: {
  applicationId: string;
  value: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(status: string) {
    setBusy(true);
    await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <select
      className="input w-auto py-1 text-xs"
      value={value}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
