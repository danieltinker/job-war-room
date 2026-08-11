import { formatDistanceToNow, format } from "date-fns";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusSelect } from "@/components/StatusSelect";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({
    include: {
      job: true,
      resume: { select: { id: true, name: true } },
      events: { orderBy: { occurredAt: "desc" }, take: 5 },
      emails: { orderBy: { receivedAt: "desc" }, take: 3 },
    },
    orderBy: { updatedAt: "desc" },
  });

  const active = applications.filter(
    (a) => !["REJECTED", "WITHDRAWN", "GHOSTED"].includes(a.status)
  );
  const closed = applications.filter((a) =>
    ["REJECTED", "WITHDRAWN", "GHOSTED"].includes(a.status)
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Applications</h1>
        <p className="mt-1 text-sm text-slate-400">
          {active.length} active · {closed.length} closed. Statuses advance automatically from
          email tracking; you can override anytime.
        </p>
      </header>

      {applications.length === 0 && (
        <div className="card text-sm text-slate-400">
          No applications yet — hit “I applied” on a suggested job to start tracking it.
        </div>
      )}

      {[
        ["Active pipeline", active],
        ["Closed", closed],
      ].map(([title, list]) =>
        (list as typeof applications).length === 0 ? null : (
          <section key={title as string}>
            <h2 className="mb-3 text-lg font-semibold text-white">{title as string}</h2>
            <div className="space-y-4">
              {(list as typeof applications).map((app) => (
                <div key={app.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <a href={app.job.url} target="_blank" className="font-semibold text-white hover:text-accent">
                        {app.job.title}
                      </a>
                      <p className="mt-0.5 text-sm text-slate-400">
                        {app.job.companyName}
                        {app.job.location ? ` · ${app.job.location}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Applied {format(app.appliedAt, "MMM d, yyyy")}
                        {app.resume ? ` · resume: ${app.resume.name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={app.status} />
                      <StatusSelect applicationId={app.id} value={app.status} />
                    </div>
                  </div>

                  {(app.events.length > 0 || app.emails.length > 0) && (
                    <div className="mt-4 border-t border-line/60 pt-3">
                      <ul className="space-y-1.5">
                        {app.events.map((e) => (
                          <li key={e.id} className="flex items-baseline gap-2 text-xs">
                            <span className="shrink-0 text-slate-500">
                              {formatDistanceToNow(e.occurredAt, { addSuffix: true })}
                            </span>
                            <span className="text-slate-300">{e.description}</span>
                            <span className="text-slate-600">({e.source.toLowerCase()})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
