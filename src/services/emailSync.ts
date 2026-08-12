/**
 * Email application-status tracking.
 *
 * Connects to the user's mailbox over IMAP (works with Gmail app passwords,
 * Fastmail, any standard IMAP server), scans recent messages, classifies the
 * job-related ones (rejection / interview / assessment / offer / received),
 * links them to applications by company, and advances pipeline statuses.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { getSettings, setSetting, SETTING_KEYS } from "@/lib/settings";
import {
  classifyEmail,
  extractCompany,
  extractNewCompanyName,
  extractPositionTitle,
  looksJobRelated,
  statusForClassification,
  shouldAdvance,
  type EmailFacts,
} from "@/core/emailClassifier";
import type { AppStatus, EmailClass, Prisma } from "@prisma/client";

export interface EmailSyncResult {
  scanned: number;
  jobRelated: number;
  linked: number;
  created: number; // applications auto-created from confirmation emails
  statusChanges: { company: string; title: string; from: string; to: string }[];
}

/** Only auto-create applications from recent mail — not a month of history. */
const AUTO_CREATE_WINDOW_MS = 7 * 86400_000;
const AUTO_CREATE_CLASSES = new Set([
  "APPLICATION_RECEIVED",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "REJECTION",
]);

export async function runEmailSync(): Promise<EmailSyncResult> {
  const cfg = await getSettings([
    SETTING_KEYS.imapHost,
    SETTING_KEYS.imapPort,
    SETTING_KEYS.imapUser,
    SETTING_KEYS.imapPassword,
    SETTING_KEYS.imapMailbox,
    SETTING_KEYS.imapLastUid,
  ]);

  const host = cfg[SETTING_KEYS.imapHost];
  const user = cfg[SETTING_KEYS.imapUser];
  const password = cfg[SETTING_KEYS.imapPassword];
  if (!host || !user || !password) {
    throw new Error("IMAP is not configured (Settings → Email tracking)");
  }
  const port = Number(cfg[SETTING_KEYS.imapPort] ?? "993");
  const mailbox = cfg[SETTING_KEYS.imapMailbox] || "INBOX";

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });

  const result: EmailSyncResult = {
    scanned: 0,
    jobRelated: 0,
    linked: 0,
    created: 0,
    statusChanges: [],
  };

  await client.connect();
  try {
    const box = await client.mailboxOpen(mailbox);
    const uidValidity = String(box.uidValidity ?? "0");

    // Cursor: "uidvalidity:lastUid". Reset if the mailbox was rebuilt.
    let lastUid = 0;
    const cursor = cfg[SETTING_KEYS.imapLastUid];
    if (cursor) {
      const [storedValidity, storedUid] = cursor.split(":");
      if (storedValidity === uidValidity) lastUid = Number(storedUid) || 0;
    }

    // First run: only look back 30 days rather than the whole mailbox.
    const searchRange = lastUid > 0
      ? { uid: `${lastUid + 1}:*` }
      : { since: new Date(Date.now() - 30 * 86400_000) };

    const uids = await client.search(searchRange, { uid: true });
    if (!uids || uids.length === 0) return result;

    // Safety cap per run; the cursor makes the next run pick up the rest.
    const batch = uids.slice(0, 200);
    const applications = await prisma.application.findMany({
      include: { job: true },
    });
    const companyNames = [
      ...new Set(applications.map((a) => a.job.companyName).filter(Boolean)),
    ];

    let maxUid = lastUid;
    for await (const msg of client.fetch(
      batch,
      { uid: true, envelope: true, source: true },
      { uid: true }
    )) {
      result.scanned++;
      if (msg.uid > maxUid) maxUid = msg.uid;

      const imapUid = `${uidValidity}:${msg.uid}`;
      const already = await prisma.emailMessage.findUnique({ where: { imapUid } });
      if (already) continue;

      const fromAddress = msg.envelope?.from?.[0]?.address ?? "";
      const fromName = msg.envelope?.from?.[0]?.name ?? "";
      const subject = msg.envelope?.subject ?? "";
      let body = "";
      if (msg.source) {
        try {
          const parsed = await simpleParser(msg.source);
          body = (parsed.text ?? "").slice(0, 8000);
        } catch {
          body = "";
        }
      }

      const facts = { fromAddress, fromName, subject, body };
      const receivedAt = msg.envelope?.date ?? new Date();
      await processJobEmail(facts, receivedAt, imapUid, { applications, companyNames }, result);
    }

    if (maxUid > lastUid) {
      await setSetting(SETTING_KEYS.imapLastUid, `${uidValidity}:${maxUid}`);
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}

type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

interface SyncCaches {
  applications: AppWithJob[];
  companyNames: string[];
}

/**
 * Classify one email, link it to (or auto-create) an application, record the
 * timeline event, and advance the pipeline status. Exported so the flow can be
 * integration-tested without an IMAP server.
 */
export async function processJobEmail(
  facts: EmailFacts,
  receivedAt: Date,
  imapUid: string,
  caches: SyncCaches,
  result: EmailSyncResult
): Promise<void> {
  const { applications, companyNames } = caches;
  if (!looksJobRelated(facts)) return;
  result.jobRelated++;

  const classification = classifyEmail(facts);
  const companyName = extractCompany(facts, companyNames);
  let application = companyName
    ? applications.find((a) => a.job.companyName.toLowerCase() === companyName.toLowerCase())
    : undefined;

  // Auto-create: an application email for a company not in the pipeline yet
  // (e.g. you applied on their site today) becomes a tracked application,
  // and the company joins the watchlist.
  if (
    !application &&
    AUTO_CREATE_CLASSES.has(classification) &&
    Date.now() - receivedAt.getTime() < AUTO_CREATE_WINDOW_MS
  ) {
    const newName = companyName ?? extractNewCompanyName(facts);
    if (newName) {
      const company = await prisma.company.upsert({
        where: { name: newName },
        create: { name: newName, notes: "Added automatically from application email" },
        update: {},
      });
      const title = extractPositionTitle(facts) ?? `Application at ${newName}`;
      const dedupeKey = `email:${newName.toLowerCase()}:${title.toLowerCase()}`;
      const job =
        (await prisma.job.findUnique({ where: { dedupeKey } })) ??
        (await prisma.job.create({
          data: {
            dedupeKey,
            source: "EMAIL",
            url: "",
            title: title.slice(0, 500),
            companyName: newName,
            companyId: company.id,
            postedAt: receivedAt,
          },
        }));
      const existingApp = await prisma.application.findUnique({
        where: { jobId: job.id },
        include: { job: true },
      });
      application =
        existingApp ??
        (await prisma.application.create({
          data: {
            jobId: job.id,
            status: "APPLIED",
            appliedAt: receivedAt,
            events: {
              create: {
                type: "status_change",
                description: `Application detected from email (${newName})`,
                source: "EMAIL",
                occurredAt: receivedAt,
              },
            },
          },
          include: { job: true },
        }));
      if (!existingApp) result.created++;
      applications.push(application);
      if (!companyNames.includes(newName)) companyNames.push(newName);
    }
  }

  const email = await prisma.emailMessage.create({
    data: {
      imapUid,
      fromAddress: facts.fromAddress,
      subject: facts.subject.slice(0, 500),
      snippet: facts.body.slice(0, 300),
      classification: classification as EmailClass,
      receivedAt,
      applicationId: application?.id ?? null,
    },
  });

  if (!application) return;
  result.linked++;

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "email",
      description: `Email (${classification.toLowerCase().replace(/_/g, " ")}): ${facts.subject.slice(0, 200)}`,
      source: "EMAIL",
      occurredAt: email.receivedAt,
    },
  });

  const proposed = statusForClassification(classification);
  if (proposed && shouldAdvance(application.status, proposed)) {
    await prisma.application.update({
      where: { id: application.id },
      data: { status: proposed as AppStatus },
    });
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: "status_change",
        description: `Status ${application.status} → ${proposed} (from email)`,
        source: "EMAIL",
      },
    });
    result.statusChanges.push({
      company: application.job.companyName,
      title: application.job.title,
      from: application.status,
      to: proposed,
    });
    application.status = proposed as AppStatus; // keep local view current
  }
}
