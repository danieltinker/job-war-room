export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { searchLinkedinJobs } from "@/scrapers/linkedin";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

/**
 * Live LinkedIn connectivity check: runs one real guest-endpoint query and
 * reports exactly what came back — proof the scan works (or the precise error).
 */
export async function POST() {
  const startedAt = Date.now();
  const linkedinLiAt = await getSetting(SETTING_KEYS.linkedinLiAt);
  const result = await searchLinkedinJobs(
    { keywords: "software engineer", location: "Israel", postedInDays: 7, maxPages: 1 },
    { linkedinLiAt }
  );
  return NextResponse.json({
    ok: result.error == null && result.rawCount > 0,
    jobsParsed: result.rawCount,
    error: result.error,
    usedCookie: Boolean(linkedinLiAt),
    durationMs: Date.now() - startedAt,
    sample: result.jobs.slice(0, 3).map((j) => ({
      title: j.title,
      company: j.companyName,
      location: j.location,
    })),
  });
}
