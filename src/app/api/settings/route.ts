export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings, setSetting, isSecretKey, SETTING_KEYS } from "@/lib/settings";

const EDITABLE_KEYS: string[] = [
  SETTING_KEYS.linkedinLiAt,
  SETTING_KEYS.imapHost,
  SETTING_KEYS.imapPort,
  SETTING_KEYS.imapUser,
  SETTING_KEYS.imapPassword,
  SETTING_KEYS.imapMailbox,
  SETTING_KEYS.waTarget,
  SETTING_KEYS.waNotifyMatches,
  SETTING_KEYS.scrapeCron,
  SETTING_KEYS.digestCron,
  SETTING_KEYS.emailSyncMinutes,
];

/** Returns editable settings; secret values are masked, only presence is shown. */
export async function GET() {
  const values = await getSettings(EDITABLE_KEYS);
  const out: Record<string, { value: string | null; secret: boolean; set: boolean }> = {};
  for (const key of EDITABLE_KEYS) {
    const secret = isSecretKey(key);
    const v = values[key];
    out[key] = { secret, set: v != null && v !== "", value: secret ? null : v };
  }
  return NextResponse.json(out);
}

const PutBody = z.record(z.string(), z.string().max(10000));

/** Upserts settings. Empty string clears a key. Unknown keys are rejected. */
export async function PUT(req: NextRequest) {
  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const entries = Object.entries(parsed.data);
  for (const [key] of entries) {
    if (!EDITABLE_KEYS.includes(key)) {
      return NextResponse.json({ error: `unknown setting: ${key}` }, { status: 400 });
    }
  }
  for (const [key, value] of entries) {
    if (value === "") {
      await prisma.setting.deleteMany({ where: { key } });
    } else {
      await setSetting(key, value);
    }
  }
  return NextResponse.json({ ok: true });
}
