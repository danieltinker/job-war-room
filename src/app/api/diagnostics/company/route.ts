export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scrapeGreenhouse } from "@/scrapers/greenhouse";
import { scrapeLever } from "@/scrapers/lever";
import { scrapeAshby } from "@/scrapers/ashby";
import { scrapeSmartrecruiters } from "@/scrapers/smartrecruiters";
import { scrapeCareersPage, detectAts } from "@/scrapers/careers";

const Body = z.object({ companyId: z.string().min(1) });

/**
 * Live per-company scrape test: runs the ATS board and/or careers page right
 * now, reports job counts and exact errors, and — when the careers page embeds
 * a known ATS board — saves the detected board on the company so future sweeps
 * use the structured API.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });

  const results: { source: string; ok: boolean; jobs: number; error?: string }[] = [];
  let detected: { kind: string; identifier: string } | null = null;

  // 1) Configured ATS board
  if (company.ats !== "NONE" && company.atsIdentifier) {
    try {
      const jobs =
        company.ats === "GREENHOUSE"
          ? await scrapeGreenhouse(company.atsIdentifier, company.name)
          : company.ats === "LEVER"
            ? await scrapeLever(company.atsIdentifier, company.name)
            : company.ats === "ASHBY"
              ? await scrapeAshby(company.atsIdentifier, company.name)
              : await scrapeSmartrecruiters(company.atsIdentifier, company.name);
      results.push({ source: `${company.ats} (${company.atsIdentifier})`, ok: true, jobs: jobs.length });
    } catch (e) {
      results.push({
        source: `${company.ats} (${company.atsIdentifier})`,
        ok: false,
        jobs: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2) Careers page — with ATS auto-detection and auto-save
  if (company.careersUrl) {
    try {
      const res = await fetch(company.careersUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        redirect: "follow",
      });
      if (res.ok) {
        const html = await res.text();
        const ats = detectAts(html);
        if (ats && company.ats === "NONE") {
          await prisma.company.update({
            where: { id: company.id },
            data: { ats: ats.kind, atsIdentifier: ats.identifier },
          });
          detected = ats;
        }
      }
      const jobs = await scrapeCareersPage(company.careersUrl, company.name);
      results.push({ source: "careers page", ok: true, jobs: jobs.length });
    } catch (e) {
      results.push({
        source: "careers page",
        ok: false,
        jobs: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (results.length === 0) {
    results.push({
      source: "none configured",
      ok: false,
      jobs: 0,
      error: "No ATS board or careers URL set — LinkedIn search covers this company in sweeps.",
    });
  }

  return NextResponse.json({ company: company.name, detected, results });
}
