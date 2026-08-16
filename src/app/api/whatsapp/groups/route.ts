export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, setSetting, SETTING_KEYS } from "@/lib/settings";

/** Groups on the connected account + which are monitored for job posts. */
export async function GET() {
  const s = await getSettings([SETTING_KEYS.waGroups, SETTING_KEYS.waJobGroups]);
  const groups: { jid: string; name: string }[] = s[SETTING_KEYS.waGroups]
    ? JSON.parse(s[SETTING_KEYS.waGroups]!)
    : [];
  const monitored: string[] = s[SETTING_KEYS.waJobGroups]
    ? JSON.parse(s[SETTING_KEYS.waJobGroups]!)
    : [];
  return NextResponse.json({
    groups: groups.sort((a, b) => a.name.localeCompare(b.name)),
    monitored,
  });
}

const Body = z.object({ monitored: z.array(z.string()).max(100) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  await setSetting(SETTING_KEYS.waJobGroups, JSON.stringify(parsed.data.monitored));
  return NextResponse.json({ ok: true, count: parsed.data.monitored.length });
}
