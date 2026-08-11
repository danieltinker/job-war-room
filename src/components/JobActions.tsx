"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResumeOption {
  id: string;
  name: string;
}

/** "Mark applied" / "Dismiss" controls used on suggestions and job rows. */
export function JobActions({
  jobId,
  matchId,
  resumes,
  hasApplication,
}: {
  jobId: string;
  matchId?: string;
  resumes: ResumeOption[];
  hasApplication: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [resumeId, setResumeId] = useState<string>("");

  async function markApplied() {
    setBusy(true);
    await fetch("/api/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, resumeId: resumeId || null }),
    });
    setBusy(false);
    setPicking(false);
    router.refresh();
  }

  async function dismiss() {
    if (!matchId) return;
    setBusy(true);
    await fetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    setBusy(false);
    router.refresh();
  }

  if (hasApplication) {
    return <span className="text-xs font-semibold text-emerald-400">In pipeline ✓</span>;
  }

  if (picking) {
    return (
      <span className="inline-flex items-center gap-2">
        <select
          className="input w-auto py-1 text-xs"
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
        >
          <option value="">No resume linked</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary py-1 text-xs" onClick={markApplied} disabled={busy}>
          Confirm
        </button>
        <button className="btn py-1 text-xs" onClick={() => setPicking(false)} disabled={busy}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="btn btn-primary py-1 text-xs"
        onClick={() => (resumes.length > 0 ? setPicking(true) : markApplied())}
        disabled={busy}
      >
        I applied
      </button>
      {matchId && (
        <button className="btn btn-danger py-1 text-xs" onClick={dismiss} disabled={busy}>
          Dismiss
        </button>
      )}
    </span>
  );
}
