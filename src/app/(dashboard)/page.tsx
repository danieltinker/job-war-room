import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { JobActions } from "@/components/JobActions";
import { RunNowButton } from "@/components/RunNowButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    suggestions,
    pipelineCounts,
    recentEvents,
    lastRun,
    watchedCompanies,
    activeProfiles,
    resumes,
  ] = await Promise.all([
    prisma.match.findMany({
      where: { status: "SUGGESTED", job: { application: null } },
      include: { job: true, profile: { select: { name: true } } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 12,
    }),
    prisma.application.groupBy({ by: ["status"], _count: true }),
    prisma.applicationEvent.findMany({
      include: { application: { include: { job: { select: { title: true, companyName: true } } } } },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
    prisma.scrapeRun.findFirst({ where: { kind: "scrape" }, orderBy: { startedAt: "desc" } }),
    prisma.company.count({ where: { active: true } }),
    prisma.positionProfile.count({ where: { active: true } }),
    prisma.resume.findMany({ select: { id: true, name: true } }),
  ]);

  const count = (s: string) => pipelineCounts.find((p) => p.status === s)?._count ?? 0;
  const activeApps = pipelineCounts
    .filter((p) => !["REJECTED", "WITHDRAWN", "GHOSTED"].includes(p.status))
    .reduce((sum, p) => sum + p._count, 0);
  const interviews = count("INTERVIEW") + count("ASSESSMENT");
  const offers = count("OFFER");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Mission control</h1>
          <p className="mt-1 text-sm text-slate-400">
            {lastRun
              ? `Last sweep ${formatDistanceToNow(lastRun.startedAt, { addSuffix: true })} — ${lastRun.newJobs} new jobs, ${lastRun.newMatches} new matches`
              : "No sweep has run yet — kick one off."}
          </p>
        </div>
        <RunNowButton kind="scrape" label="⚡ Run sweep now" />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Suggested" value={suggestions.length} href="/jobs?view=suggested" />
        <Stat label="Active applications" value={activeApps} href="/applications" />
        <Stat label="Interview / assessment" value={interviews} href="/applications" />
        <Stat label="Offers" value={offers} href="/applications" />
        <Stat label="Watching" value={`${watchedCompanies}co · ${activeProfiles}pr`} href="/companies" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">🎯 Suggested for you</h2>
          <Link href="/jobs" className="text-sm text-accent hover:underline">
            All jobs →
          </Link>
        </div>
        {suggestions.length === 0 ? (
          <div className="card text-sm text-slate-400">
            No open suggestions. Add <Link href="/companies" className="text-accent hover:underline">companies</Link> and{" "}
            <Link href="/profiles" className="text-accent hover:underline">position profiles</Link>, then run a sweep.
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Position</th>
                  <th className="th">Company</th>
                  <th className="th">Location</th>
                  <th className="th">Score</th>
                  <th className="th">Found</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {suggestions.map((m) => (
                  <tr key={m.id}>
                    <td className="td max-w-xs">
                      <a href={m.job.url} target="_blank" className="font-medium text-white hover:text-accent">
                        {m.job.title}
                      </a>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {m.profile.name}
                        {m.matchedKeywords.length > 0 && ` · ${m.matchedKeywords.slice(0, 4).join(", ")}`}
                      </div>
                    </td>
                    <td className="td">{m.job.companyName}</td>
                    <td className="td text-slate-400">{m.job.location || "—"}</td>
                    <td className="td">
                      <span className="font-mono font-semibold text-accent">{m.score}%</span>
                    </td>
                    <td className="td text-xs text-slate-400">
                      {formatDistanceToNow(m.createdAt, { addSuffix: true })}
                    </td>
                    <td className="td">
                      <JobActions jobId={m.jobId} matchId={m.id} resumes={resumes} hasApplication={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">📡 Recent activity</h2>
        {recentEvents.length === 0 ? (
          <div className="card text-sm text-slate-400">
            Pipeline events (manual updates + email-detected changes) will appear here.
          </div>
        ) : (
          <div className="card divide-y divide-line/60 p-0">
            {recentEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    <span className="font-medium text-white">
                      {e.application.job.companyName}
                    </span>{" "}
                    <span className="text-slate-400">— {e.application.job.title}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{e.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={e.source} />
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDistanceToNow(e.occurredAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link href={href} className="card transition hover:border-accent/50">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
    </Link>
  );
}
