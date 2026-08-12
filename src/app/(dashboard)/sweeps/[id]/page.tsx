import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  ats: "ATS board",
  careers: "Careers page",
  "linkedin-company": "LinkedIn (company)",
  "linkedin-profile": "LinkedIn (profile)",
};

export default async function SweepDetailPage({ params }: { params: { id: string } }) {
  const run = await prisma.scrapeRun.findUnique({
    where: { id: params.id },
    include: { sources: { orderBy: [{ status: "desc" }, { kind: "asc" }, { label: "asc" }] } },
  });
  if (!run) notFound();

  const ok = run.sources.filter((s) => s.status === "OK").length;
  const empty = run.sources.filter((s) => s.status === "EMPTY").length;
  const failed = run.sources.filter((s) => s.status === "FAILED").length;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/sweeps" className="text-sm text-accent hover:underline">
          ← All sweeps
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Sweep — {format(run.startedAt, "MMM d, HH:mm")}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {run.companiesScanned} companies · {run.queriesRun} queries · {run.jobsFound} jobs found ·{" "}
          {run.newJobs} new · {run.jobsScored} scored · {run.newMatches} new matches
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4 lg:grid-cols-3">
        <div className="card">
          <p className="text-2xl font-bold text-emerald-300">{ok}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">
            Sources OK
          </p>
        </div>
        <div className="card">
          <p className="text-2xl font-bold text-slate-300">{empty}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">
            Returned nothing
          </p>
        </div>
        <div className="card">
          <p className="text-2xl font-bold text-red-300">{failed}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">Failed</p>
        </div>
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Source</th>
              <th className="th">Type</th>
              <th className="th">Status</th>
              <th className="th">Jobs</th>
              <th className="th">Took</th>
              <th className="th">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {run.sources.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No per-source records for this run (it predates sweep telemetry).
                </td>
              </tr>
            )}
            {run.sources.map((s) => (
              <tr key={s.id}>
                <td className="td font-medium text-white">{s.label}</td>
                <td className="td text-xs text-slate-400">{KIND_LABELS[s.kind] ?? s.kind}</td>
                <td className="td">
                  <StatusBadge status={s.status} />
                </td>
                <td className="td">{s.jobsFound}</td>
                <td className="td text-xs text-slate-400">{(s.durationMs / 1000).toFixed(1)}s</td>
                <td className="td max-w-md text-xs text-red-300">{s.error || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {run.detail && (
        <section className="card">
          <h2 className="mb-2 font-semibold text-white">Run notes</h2>
          <p className="whitespace-pre-wrap font-mono text-xs text-slate-400">{run.detail}</p>
        </section>
      )}
    </div>
  );
}
