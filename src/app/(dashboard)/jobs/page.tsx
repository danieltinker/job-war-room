import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/db";
import { JobActions } from "@/components/JobActions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  view?: string; // all | suggested
  company?: string;
}

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = searchParams.q?.trim() ?? "";
  const view = searchParams.view === "suggested" ? "suggested" : "all";

  const where: Prisma.JobWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
    ];
  }
  if (view === "suggested") {
    where.matches = { some: { status: "SUGGESTED" } };
    where.application = null;
  }

  const [jobs, resumes] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        matches: { orderBy: { score: "desc" } },
        application: { select: { id: true, status: true } },
      },
      orderBy: { discoveredAt: "desc" },
      take: 200,
    }),
    prisma.resume.findMany({ select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Everything the daily sweeps have found ({jobs.length} shown).
          </p>
        </div>
        <form className="flex gap-2" action="/jobs">
          <input className="input w-64" name="q" placeholder="Search title, company, location…" defaultValue={q} />
          {view === "suggested" && <input type="hidden" name="view" value="suggested" />}
          <button className="btn">Search</button>
        </form>
      </header>

      <div className="flex gap-2">
        <Link href="/jobs" className={`btn ${view === "all" ? "btn-primary" : ""}`}>
          All
        </Link>
        <Link href="/jobs?view=suggested" className={`btn ${view === "suggested" ? "btn-primary" : ""}`}>
          Suggested only
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Position</th>
              <th className="th">Company</th>
              <th className="th">Location</th>
              <th className="th">Source</th>
              <th className="th">Best match</th>
              <th className="th">Found</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {jobs.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  Nothing here yet. Run a sweep from the dashboard.
                </td>
              </tr>
            )}
            {jobs.map((job) => {
              const openMatch = job.matches.find((m) => m.status === "SUGGESTED");
              // scoreDetail is free-form JSON in the DB — normalize defensively
              // (rows written by older code may have a different shape).
              const detail = (Array.isArray(job.scoreDetail) ? job.scoreDetail : []).flatMap(
                (d) => {
                  if (!d || typeof d !== "object" || Array.isArray(d)) return [];
                  const entry = d as Record<string, unknown>;
                  return [
                    {
                      profile: String(entry.profile ?? "?"),
                      score: Number(entry.score ?? 0),
                      matched: Array.isArray(entry.matched) ? entry.matched.map(String) : [],
                      reason: String(entry.reason ?? ""),
                    },
                  ];
                }
              );
              return (
                <tr key={job.id}>
                  <td className="td max-w-sm">
                    {job.url ? (
                      <a href={job.url} target="_blank" className="font-medium text-white hover:text-accent">
                        {job.title}
                      </a>
                    ) : (
                      <span className="font-medium text-white">{job.title}</span>
                    )}
                    {detail.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-500 hover:text-accent">
                          score breakdown
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
                          {detail.map((d) => (
                            <li key={d.profile}>
                              <span className="text-slate-300">{d.profile}</span>:{" "}
                              <span className="font-mono">{d.score}</span>
                              {d.matched.length > 0
                                ? ` — ${d.matched.join(", ")}`
                                : ` — ${d.reason}`}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="td">{job.companyName}</td>
                  <td className="td text-slate-400">{job.location || "—"}</td>
                  <td className="td text-xs uppercase text-slate-500">{job.source.toLowerCase()}</td>
                  <td className="td">
                    {job.bestScore != null && job.bestScore > 0 ? (
                      <span className="font-mono font-semibold text-accent">{job.bestScore}%</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="td text-xs text-slate-400">
                    {formatDistanceToNow(job.discoveredAt, { addSuffix: true })}
                  </td>
                  <td className="td">
                    <JobActions
                      jobId={job.id}
                      matchId={openMatch?.id}
                      resumes={resumes}
                      hasApplication={job.application != null}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
