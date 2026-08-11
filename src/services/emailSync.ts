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
  looksJobRelated,
  statusForClassification,
  shouldAdvance,
} from "@/core/emailClassifier";
import type { AppStatus, EmailClass } from "@prisma/client";

export interface EmailSyncResult {
  scanned: number;
  jobRelated: number;
  linked: number;
  statusChanges: { company: string; title: string; from: string; to: string }[];
}

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

  const result: EmailSyncResult = { scanned: 0, jobRelated: 0, linked: 0, statusChanges: [] };

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

      const facts = { fromAddress, subject, body };
      if (!looksJobRelated(facts)) continue;
      result.jobRelated++;

      const classification = classifyEmail(facts);
      const companyName = extractCompany(facts, companyNames);
      const application = companyName
        ? applications.find(
            (a) => a.job.companyName.toLowerCase() === companyName.toLowerCase()
          )
        : undefined;

      const email = await prisma.emailMessage.create({
        data: {
          imapUid,
          fromAddress,
          subject: subject.slice(0, 500),
          snippet: body.slice(0, 300),
          classification: classification as EmailClass,
          receivedAt: msg.envelope?.date ?? new Date(),
          applicationId: application?.id ?? null,
        },
      });

      if (!application) continue;
      result.linked++;

      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          type: "email",
          description: `Email (${classification.toLowerCase().replace(/_/g, " ")}): ${subject.slice(0, 200)}`,
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

    if (maxUid > lastUid) {
      await setSetting(SETTING_KEYS.imapLastUid, `${uidValidity}:${maxUid}`);
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}
