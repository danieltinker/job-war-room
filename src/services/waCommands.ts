/**
 * WhatsApp command handler — run the war room from your phone.
 *
 *   /jobs        top open suggestions, numbered, with apply links
 *   /applied N   mark suggestion N applied (attaches the profile's default resume)
 *   /dismiss N   dismiss suggestion N
 *   /status      pipeline summary + recent activity
 *   /help        this list
 *
 * Only messages starting with "/" are treated as commands, and replies never
 * start with "/", so the bot can safely share a chat with its own digests.
 */
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

const LAST_LIST_KEY = "whatsapp.lastList";

const HELP = [
  "🎯 *War Room commands*",
  "/jobs — top suggestions with links",
  "/applied N — mark suggestion N as applied",
  "/dismiss N — dismiss suggestion N",
  "/status — pipeline summary",
].join("\n");

export async function handleWaCommand(text: string): Promise<string> {
  const [cmd, ...args] = text.trim().split(/\s+/);
  switch (cmd.toLowerCase()) {
    case "/jobs":
      return listJobs();
    case "/applied":
      return markFromList(args[0], "applied");
    case "/dismiss":
      return markFromList(args[0], "dismissed");
    case "/status":
      return pipelineStatus();
    default:
      return HELP;
  }
}

async function listJobs(): Promise<string> {
  const all = await prisma.match.findMany({
    where: { status: "SUGGESTED", job: { application: null } },
    include: { job: true, profile: { select: { name: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 40,
  });
  // One entry per job — keep the highest-scoring profile's match
  const seen = new Set<string>();
  const matches = all.filter((m) => {
    if (seen.has(m.jobId)) return false;
    seen.add(m.jobId);
    return true;
  }).slice(0, 8);
  if (matches.length === 0) {
    return "No open suggestions right now. I'll ping you when the next sweep finds matches.";
  }
  await setSetting(LAST_LIST_KEY, JSON.stringify(matches.map((m) => m.id)));
  const lines = ["🎯 *Top suggestions* (reply /applied N or /dismiss N)", ""];
  matches.forEach((m, i) => {
    lines.push(`*${i + 1}.* ${m.job.title} @ ${m.job.companyName} — ${m.score}% (${m.profile.name})`);
    if (m.job.url) lines.push(`   ${m.job.url}`);
  });
  return lines.join("\n");
}

async function markFromList(indexArg: string | undefined, action: "applied" | "dismissed"): Promise<string> {
  const index = Number(indexArg);
  if (!indexArg || !Number.isInteger(index) || index < 1) {
    return `Usage: /${action === "applied" ? "applied" : "dismiss"} N — N is the number from the last /jobs list.`;
  }
  const stored = await getSetting(LAST_LIST_KEY);
  const ids: string[] = stored ? JSON.parse(stored) : [];
  const matchId = ids[index - 1];
  if (!matchId) return `I don't have a #${index} on the last list — send /jobs for a fresh one.`;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { job: true, profile: { include: { resume: { select: { id: true, name: true } } } } },
  });
  if (!match) return "That suggestion no longer exists — send /jobs for a fresh list.";

  if (action === "dismissed") {
    await prisma.match.update({ where: { id: matchId }, data: { status: "DISMISSED" } });
    return `Dismissed: ${match.job.title} @ ${match.job.companyName}.`;
  }

  const existing = await prisma.application.findUnique({ where: { jobId: match.jobId } });
  if (existing) return `Already in your pipeline: ${match.job.title} @ ${match.job.companyName}.`;

  const resume = match.profile.resume;
  await prisma.application.create({
    data: {
      jobId: match.jobId,
      resumeId: resume?.id ?? null,
      status: "APPLIED",
      events: {
        create: {
          type: "status_change",
          description: "Marked as applied (via WhatsApp)",
          source: "MANUAL",
        },
      },
    },
  });
  await prisma.match.updateMany({
    where: { jobId: match.jobId, status: "SUGGESTED" },
    data: { status: "CONVERTED" },
  });
  return [
    `✅ Applied: ${match.job.title} @ ${match.job.companyName}`,
    resume ? `Resume on file: ${resume.name}` : "No resume linked (profile has no default resume).",
    "Email tracking will pick up the confirmation automatically.",
  ].join("\n");
}

async function pipelineStatus(): Promise<string> {
  const [counts, events] = await Promise.all([
    prisma.application.groupBy({ by: ["status"], _count: true }),
    prisma.applicationEvent.findMany({
      include: { application: { include: { job: { select: { title: true, companyName: true } } } } },
      orderBy: { occurredAt: "desc" },
      take: 5,
    }),
  ]);
  if (counts.length === 0) return "Pipeline is empty — send /jobs to see suggestions.";
  const lines = ["📊 *Pipeline*"];
  for (const c of counts) {
    lines.push(`• ${c.status.toLowerCase().replace(/_/g, " ")}: ${c._count}`);
  }
  if (events.length > 0) {
    lines.push("", "*Recent:*");
    for (const e of events) {
      lines.push(`• ${e.application.job.companyName}: ${e.description}`);
    }
  }
  return lines.join("\n");
}
