/** Composes the daily WhatsApp digest: fresh suggestions + pipeline movement. */
import { prisma } from "@/lib/db";

export async function composeDigest(hours = 24): Promise<string | null> {
  const since = new Date(Date.now() - hours * 3600_000);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const [matches, events, pipeline] = await Promise.all([
    prisma.match.findMany({
      where: { createdAt: { gte: since }, status: "SUGGESTED" },
      include: { job: true, profile: true },
      orderBy: { score: "desc" },
      take: 10,
    }),
    prisma.applicationEvent.findMany({
      where: { occurredAt: { gte: since }, type: "status_change" },
      include: { application: { include: { job: true } } },
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
    prisma.application.groupBy({ by: ["status"], _count: true }),
  ]);

  if (matches.length === 0 && events.length === 0) return null;

  const lines: string[] = ["🎯 *Job War Room — Daily Brief*", ""];

  if (matches.length > 0) {
    lines.push(`*${matches.length} new suggested position${matches.length > 1 ? "s" : ""}:*`);
    for (const m of matches) {
      lines.push(`• ${m.job.title} @ ${m.job.companyName} (${m.score}%)`);
      lines.push(`  ${m.job.url}`);
    }
    lines.push("");
  }

  if (events.length > 0) {
    lines.push("*Pipeline updates:*");
    for (const e of events) {
      lines.push(`• ${e.application.job.companyName} — ${e.description}`);
    }
    lines.push("");
  }

  const counts = pipeline
    .map((p) => `${p.status.toLowerCase().replace(/_/g, " ")}: ${p._count}`)
    .join(" · ");
  if (counts) lines.push(`_Pipeline: ${counts}_`);
  lines.push("", `War room: ${appUrl}`);

  return lines.join("\n");
}

export function composeMatchAlert(
  summaries: { title: string; company: string; score: number; url: string }[]
): string | null {
  if (summaries.length === 0) return null;
  const top = summaries.slice(0, 5);
  const lines = [`🔔 *${summaries.length} new matching position${summaries.length > 1 ? "s" : ""} found:*`, ""];
  for (const s of top) {
    lines.push(`• ${s.title} @ ${s.company} (${s.score}%)`);
    lines.push(`  ${s.url}`);
  }
  if (summaries.length > top.length) lines.push(`…and ${summaries.length - top.length} more.`);
  return lines.join("\n");
}
