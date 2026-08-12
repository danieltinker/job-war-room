"use client";

import { useState } from "react";

interface TestResult {
  ok: boolean;
  jobsParsed: number;
  error: string | null;
  usedCookie: boolean;
  durationMs: number;
  sample: { title: string; company: string; location: string }[];
}

export function LinkedinTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const data = await fetch("/api/diagnostics/linkedin", { method: "POST" })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    setResult(data);
  }

  return (
    <div className="space-y-3">
      <button className="btn" onClick={run} disabled={busy}>
        {busy ? "Testing LinkedIn… (takes ~10s)" : "🔬 Test LinkedIn scan"}
      </button>
      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {result.ok ? (
            <>
              <p className="font-semibold">
                ✓ LinkedIn scan works — parsed {result.jobsParsed} job cards in{" "}
                {(result.durationMs / 1000).toFixed(1)}s
                {result.usedCookie ? " (using your li_at cookie)" : " (logged-out)"}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs opacity-90">
                {result.sample.map((s, i) => (
                  <li key={i}>
                    • {s.title} @ {s.company} — {s.location}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="font-semibold">✗ LinkedIn scan failed</p>
              <p className="mt-1 text-xs">
                {result.error ?? `0 job cards parsed — LinkedIn may be serving an empty/challenge page.`}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {result.usedCookie
                  ? "Tried with your li_at cookie — it may have expired; grab a fresh one from your browser."
                  : "Tip: adding your li_at cookie in the LinkedIn section below usually fixes rate-limiting."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
