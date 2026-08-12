import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Typed key registry for the Setting table. Secrets are AES-256-GCM encrypted
 * at rest; everything else is stored as plain text/JSON.
 */
export const SETTING_KEYS = {
  // LinkedIn
  linkedinLiAt: "linkedin.li_at", // secret — authenticated cookie (optional)
  // Email (IMAP)
  imapHost: "imap.host",
  imapPort: "imap.port",
  imapUser: "imap.user",
  imapPassword: "imap.password", // secret
  imapMailbox: "imap.mailbox",
  imapLastUid: "imap.lastUid", // internal cursor
  // WhatsApp
  waDesired: "whatsapp.desired", // "connected" | "disconnected"
  waStatus: "whatsapp.status", // "disconnected" | "waiting_qr" | "connected"
  waQr: "whatsapp.qr", // data-url of pairing QR while waiting
  waError: "whatsapp.error", // last connection error, shown in the dashboard
  waTarget: "whatsapp.target", // phone number to send digests to, e.g. 9725...
  waNotifyMatches: "whatsapp.notifyMatches", // "true" | "false" — instant alerts
  // Scheduling
  scrapeCron: "schedule.scrapeCron", // default "0 7 * * *"
  digestCron: "schedule.digestCron", // default "30 7 * * *"
  emailSyncMinutes: "schedule.emailSyncMinutes", // default "10"
} as const;

const SECRET_KEYS: string[] = [SETTING_KEYS.linkedinLiAt, SETTING_KEYS.imapPassword];

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.includes(key);
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  return row.encrypted ? decryptSecret(row.value) : row.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const encrypted = isSecretKey(key);
  const stored = encrypted ? encryptSecret(value) : value;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, encrypted },
    update: { value: stored, encrypted },
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key } });
}

export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = null;
  for (const row of rows) {
    out[row.key] = row.encrypted ? decryptSecret(row.value) : row.value;
  }
  return out;
}
