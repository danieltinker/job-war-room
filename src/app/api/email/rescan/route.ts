export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SETTING_KEYS } from "@/lib/settings";
import { enqueueNow, QUEUE_NAMES } from "@/lib/queue";

/**
 * Rescan the inbox from scratch (last 30 days): clears the IMAP cursor and
 * forgets previously-seen emails that never got linked to an application, so
 * the sync can re-evaluate them with the current extraction rules — e.g.
 * LinkedIn Easy Apply confirmations that predate LinkedIn-format support.
 * Emails already linked to applications are kept (their history stays).
 */
export async function POST() {
  await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.imapLastUid } });
  const forgotten = await prisma.emailMessage.deleteMany({
    where: { applicationId: null },
  });
  await enqueueNow(QUEUE_NAMES.emailSync);
  return NextResponse.json({ ok: true, forgottenEmails: forgotten.count, queued: true });
}
