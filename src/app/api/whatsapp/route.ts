export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, setSetting, SETTING_KEYS } from "@/lib/settings";
import { enqueueNow, QUEUE_NAMES } from "@/lib/queue";

/** Connection status + pairing QR (polled by the settings page). */
export async function GET() {
  const s = await getSettings([
    SETTING_KEYS.waStatus,
    SETTING_KEYS.waQr,
    SETTING_KEYS.waDesired,
    SETTING_KEYS.waTarget,
    SETTING_KEYS.waError,
  ]);
  return NextResponse.json({
    status: s[SETTING_KEYS.waStatus] ?? "disconnected",
    desired: s[SETTING_KEYS.waDesired] ?? "disconnected",
    qr: s[SETTING_KEYS.waQr],
    target: s[SETTING_KEYS.waTarget],
    error: s[SETTING_KEYS.waError],
  });
}

const Body = z.object({ action: z.enum(["connect", "disconnect"]) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const desired = parsed.data.action === "connect" ? "connected" : "disconnected";
  await setSetting(SETTING_KEYS.waDesired, desired);
  await enqueueNow(QUEUE_NAMES.whatsapp, {
    action: parsed.data.action,
  });
  return NextResponse.json({ ok: true, desired });
}
