/**
 * War Room worker: owns everything that runs outside a web request —
 * scheduled scraping sweeps, email polling, the WhatsApp connection,
 * and daily digests. Communicates with the web app through Postgres
 * (data + settings) and Redis (BullMQ queues).
 */
import { Worker, Queue } from "bullmq";
import { prisma } from "@/lib/db";
import { redisConnection, QUEUE_NAMES } from "@/lib/queue";
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings";
import { runScrapeSweep } from "@/scrapers";
import { runEmailSync } from "@/services/emailSync";
import { ensureWhatsapp, sendWhatsappText, stopWhatsapp } from "@/services/whatsapp";
import { composeDigest, composeMatchAlert } from "@/services/digest";
import { seedStarterProfiles } from "@/services/seedProfiles";

const connection = redisConnection();
const TZ = process.env.TZ ?? "UTC";

const log = (msg: string) => console.log(`[worker ${new Date().toISOString()}] ${msg}`);

async function recordRun<T>(
  kind: string,
  fn: () => Promise<T>,
  summarize: (r: T) => { jobsFound?: number; newJobs?: number; newMatches?: number; detail?: string }
): Promise<T> {
  const run = await prisma.scrapeRun.create({ data: { kind } });
  try {
    const result = await fn();
    const s = summarize(result);
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        jobsFound: s.jobsFound ?? 0,
        newJobs: s.newJobs ?? 0,
        newMatches: s.newMatches ?? 0,
        detail: (s.detail ?? "").slice(0, 4000),
      },
    });
    return result;
  } catch (e) {
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        detail: (e instanceof Error ? e.message : String(e)).slice(0, 4000),
      },
    });
    throw e;
  }
}

// ── Processors ───────────────────────────────────────────────────────────

new Worker(
  QUEUE_NAMES.scrape,
  async () => {
    log("scrape sweep starting");
    const result = await recordRun("scrape", runScrapeSweep, (r) => ({
      jobsFound: r.jobsFound,
      newJobs: r.newJobs,
      newMatches: r.newMatches,
      detail: r.errors.join("; "),
    }));
    log(`scrape done: ${result.jobsFound} found, ${result.newJobs} new, ${result.newMatches} matches`);

    // Instant WhatsApp alert for fresh matches (if enabled)
    const notify = await getSetting(SETTING_KEYS.waNotifyMatches);
    if (notify === "true" && result.newMatchSummaries.length > 0) {
      const alert = composeMatchAlert(result.newMatchSummaries);
      if (alert) await sendWhatsappText(alert).catch((e) => log(`wa alert failed: ${e}`));
    }
  },
  { connection, concurrency: 1 }
);

new Worker(
  QUEUE_NAMES.emailSync,
  async () => {
    const configured = await getSetting(SETTING_KEYS.imapHost);
    if (!configured) return; // silently skip until the user configures IMAP
    const result = await recordRun("email-sync", runEmailSync, (r) => ({
      jobsFound: r.scanned,
      newJobs: r.jobRelated,
      newMatches: r.statusChanges.length,
      detail: [
        r.created ? `${r.created} application(s) auto-created` : "",
        ...r.statusChanges.map((c) => `${c.company}: ${c.from}→${c.to}`),
      ]
        .filter(Boolean)
        .join("; "),
    }));
    if (result.statusChanges.length > 0) {
      log(`email sync: ${result.statusChanges.length} status change(s)`);
      const lines = result.statusChanges.map(
        (c) => `📬 ${c.company} — ${c.title}: *${c.from} → ${c.to}*`
      );
      await sendWhatsappText(lines.join("\n")).catch(() => {});
    }
  },
  { connection, concurrency: 1 }
);

new Worker(
  QUEUE_NAMES.digest,
  async () => {
    const digest = await composeDigest(24);
    if (!digest) {
      log("digest: nothing new, skipping");
      return;
    }
    const sent = await sendWhatsappText(digest);
    log(sent ? "digest sent via WhatsApp" : "digest composed but WhatsApp not connected");
    await recordRun("digest", async () => sent, (s) => ({
      detail: s ? "sent" : "whatsapp not connected",
    }));
  },
  { connection, concurrency: 1 }
);

new Worker(
  QUEUE_NAMES.whatsapp,
  async (job) => {
    if (job.data?.action === "disconnect") await stopWhatsapp();
    await ensureWhatsapp();
  },
  { connection, concurrency: 1 }
);

// ── Schedules (cron, configurable from Settings) ─────────────────────────

async function applySchedules() {
  const scrapeCron = (await getSetting(SETTING_KEYS.scrapeCron)) ?? "0 7 * * *";
  const digestCron = (await getSetting(SETTING_KEYS.digestCron)) ?? "30 7 * * *";
  const emailMinutes = Number((await getSetting(SETTING_KEYS.emailSyncMinutes)) ?? "10") || 10;

  const scrapeQ = new Queue(QUEUE_NAMES.scrape, { connection });
  const digestQ = new Queue(QUEUE_NAMES.digest, { connection });
  const emailQ = new Queue(QUEUE_NAMES.emailSync, { connection });

  // Replace existing repeatable schedules with the current configuration.
  for (const q of [scrapeQ, digestQ, emailQ]) {
    const schedulers = await q.getJobSchedulers();
    for (const s of schedulers) await q.removeJobScheduler(s.key);
  }

  await scrapeQ.upsertJobScheduler("daily-scrape", { pattern: scrapeCron, tz: TZ });
  await digestQ.upsertJobScheduler("daily-digest", { pattern: digestCron, tz: TZ });
  await emailQ.upsertJobScheduler("email-sync", { every: emailMinutes * 60_000 });

  log(`schedules applied: scrape "${scrapeCron}", digest "${digestCron}", email every ${emailMinutes}m (tz ${TZ})`);
}

// Re-read schedule settings periodically so dashboard edits take effect.
let scheduleFingerprint = "";
async function refreshSchedulesIfChanged() {
  const values = await Promise.all([
    getSetting(SETTING_KEYS.scrapeCron),
    getSetting(SETTING_KEYS.digestCron),
    getSetting(SETTING_KEYS.emailSyncMinutes),
  ]);
  const fp = values.join("|");
  if (fp !== scheduleFingerprint) {
    scheduleFingerprint = fp;
    await applySchedules();
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────

async function main() {
  log("war room worker booting");
  const seeded = await seedStarterProfiles();
  if (seeded > 0) log(`seeded ${seeded} starter position profile(s)`);
  await setSetting(SETTING_KEYS.waStatus, "disconnected");
  await refreshSchedulesIfChanged();
  await ensureWhatsapp().catch((e) => log(`whatsapp: ${e}`));

  setInterval(() => {
    refreshSchedulesIfChanged().catch((e) => log(`schedule refresh failed: ${e}`));
    ensureWhatsapp().catch((e) => log(`whatsapp ensure failed: ${e}`));
  }, 20_000);

  log("worker ready");
}

main().catch((e) => {
  console.error("worker failed to boot", e);
  process.exit(1);
});
