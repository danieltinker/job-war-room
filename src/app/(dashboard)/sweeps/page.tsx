import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { RunNowButton } from "@/components/RunNowButton";

export const dynamic = "force-dynamic";

export default async function SweepsPage() {
  const [runs, totals, jobCount, companyCount, suggestionCount] = await Promise.all([
    prisma.scrapeRun.findMany({
      where: { kind: "scrape" },
      orderBy: { startedAt: "desc" },
      take: 30,
      include: { _count: { select: { sources: true } } },
    }),
    prisma.scrapeRun.aggregate({
      where: { kind: "scrape", status: "SUCCESS" },
      _sum: { jobsFound: true, newJobs: true, newMatches: true, queriesRun: true },
      _count: true,
    }),
    prisma.job.count(),
    prisma.company.count({ where: { active: true } }),
    prisma.match.count({ where: { status: "SUGGESTED" } }),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sweeps</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every scan, every source, every result — no guessing.
          </p>
        </div>
        <RunNowButton kind="scrape" label="⚡ Run sweep now" />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="Sweeps completed" value={totals._count} />
        <Stat label="Companies watched" value={companyCount} />
        <Stat label="Queries run (total)" value={totals._sum.queriesRun ?? 0} />
        <Stat label="Jobs seen (total)" value={totals._sum.jobsFound ?? 0} />
        <Stat label="Jobs in database" value={jobCount} />
        <Stat label="Open suggestions" value={suggestionCount} />
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold text-white">🧮 How scoring works</h2>
        <p className="text-sm text-slate-300">
          Every scraped job is scored 0–100 against each active profile:{" "}
          <span className="text-accent">title keyword</span> hit = 30 pts ·{" "}
          <span className="text-accent">keyword</span> in title = 15 pts · keyword in description = 8
          pts. Any <span className="text-red-300">exclude keyword</span> → score 0. If the profile
          has locations, the job must match one (or look remote when remote is allowed). A job is{" "}
          <b>suggested</b> when its score reaches the profile&apos;s threshold. Each job&apos;s full
          per-profile breakdown is visible on the{" "}
          <Link href="/jobs" className="text-accent hover:underline">
            Jobs page
          </Link>
          .
        </p>
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Started</th>
              <th className="th">Status</th>
              <th className="th">Companies</th>
              <th className="th">Queries</th>
              <th className="th">Jobs found</th>
              <th className="th">New</th>
              <th className="th">Scored</th>
              <th className="th">Matches</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {runs.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={9}>
                  No sweeps yet.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="td text-slate-300">
                  {formatDistanceToNow(r.startedAt, { addSuffix: true })}
                </td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td">{r.companiesScanned}</td>
                <td className="td">{r.queriesRun}</td>
                <td className="td">{r.jobsFound}</td>
                <td className="td">{r.newJobs}</td>
                <td className="td">{r.jobsScored}</td>
                <td className="td">{r.newMatches}</td>
                <td className="td">
                  <Link href={`/sweeps/${r.id}`} className="btn py-1 text-xs">
                    Details ({r._count.sources})
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}
