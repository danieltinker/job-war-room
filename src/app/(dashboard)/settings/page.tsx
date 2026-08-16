import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/SettingsForm";
import { WhatsAppPanel } from "@/components/WhatsAppPanel";
import { LinkedinTest } from "@/components/LinkedinTest";
import { WaGroupsPanel } from "@/components/WaGroupsPanel";
import { RunNowButton } from "@/components/RunNowButton";
import { RescanButton } from "@/components/RescanButton";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 15,
  });

  return (
    <div className="max-w-4xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings & integrations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Connect LinkedIn, your inbox, and WhatsApp. Secrets are encrypted at rest.
          </p>
        </div>
        <div className="flex gap-2">
          <RunNowButton kind="scrape" label="Run sweep" />
          <RunNowButton kind="email" label="Sync email" />
          <RescanButton />
          <RunNowButton kind="digest" label="Send digest" />
        </div>
      </header>

      <WhatsAppPanel />
      <WaGroupsPanel />
      <section className="card space-y-3">
        <h2 className="font-semibold text-white">🔬 Diagnostics</h2>
        <p className="text-sm text-slate-400">
          Runs one real LinkedIn query right now and shows exactly what came back — use it to
          verify scanning works from this machine.
        </p>
        <LinkedinTest />
      </section>
      <SettingsForm />

      <section className="card p-0">
        <h2 className="border-b border-line px-5 py-4 font-semibold text-white">Run history</h2>
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Kind</th>
              <th className="th">Status</th>
              <th className="th">Scanned</th>
              <th className="th">New</th>
              <th className="th">Matches</th>
              <th className="th">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {runs.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} title={r.detail}>
                <td className="td">
                  {r.kind === "scrape" ? (
                    <a href={`/sweeps/${r.id}`} className="text-accent hover:underline">
                      {r.kind}
                    </a>
                  ) : (
                    r.kind
                  )}
                </td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td">{r.jobsFound}</td>
                <td className="td">{r.newJobs}</td>
                <td className="td">{r.newMatches}</td>
                <td className="td text-xs text-slate-400">
                  {formatDistanceToNow(r.startedAt, { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
