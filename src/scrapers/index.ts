/**
 * Scrape orchestrator: runs one full sweep —
 *   1. every active watchlist company (its ATS board and/or LinkedIn),
 *   2. every active position profile as a LinkedIn keyword search,
 * then upserts jobs, scores them against profiles, and records matches.
 */
import { prisma } from "@/lib/db";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { scoreJob } from "@/core/matching";
import { dedupeKeyFor } from "@/core/normalize";
import { scrapeGreenhouse } from "./greenhouse";
import { scrapeLever } from "./lever";
import { scrapeAshby } from "./ashby";
import { scrapeCareersPage } from "./careers";
import { scrapeSmartrecruiters } from "./smartrecruiters";
import { searchLinkedinJobs, enrichDescriptions } from "./linkedin";
import type { ScrapedJob, ScrapeContext } from "./types";

export interface SweepResult {
  jobsFound: number;
  newJobs: number;
  newMatches: number;
  errors: string[];
  newMatchSummaries: { title: string; company: string; score: number; url: string }[];
}

async function scrapeCompany(
  company: {
    id: string;
    name: string;
    ats: string;
    atsIdentifier: string;
    linkedinSlug: string;
    careersUrl: string;
  },
  ctx: ScrapeContext,
  errors: string[]
): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  try {
    if (company.ats === "GREENHOUSE" && company.atsIdentifier) {
      jobs.push(...(await scrapeGreenhouse(company.atsIdentifier, company.name)));
    } else if (company.ats === "LEVER" && company.atsIdentifier) {
      jobs.push(...(await scrapeLever(company.atsIdentifier, company.name)));
    } else if (company.ats === "ASHBY" && company.atsIdentifier) {
      jobs.push(...(await scrapeAshby(company.atsIdentifier, company.name)));
    } else if (company.ats === "SMARTRECRUITERS" && company.atsIdentifier) {
      jobs.push(...(await scrapeSmartrecruiters(company.atsIdentifier, company.name)));
    }
  } catch (e) {
    errors.push(`${company.name} (ATS): ${e instanceof Error ? e.message : String(e)}`);
  }

  // Direct careers-page scrape (auto-detects embedded ATS boards, JSON-LD, links)
  if (company.careersUrl) {
    try {
      jobs.push(...(await scrapeCareersPage(company.careersUrl, company.name)));
    } catch (e) {
      errors.push(`${company.name} (careers): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // LinkedIn sweep for the company (guest search filtered by company name)
  if (company.linkedinSlug || jobs.length === 0) {
    try {
      const liJobs = await searchLinkedinJobs(
        { keywords: company.name, companyName: company.name, postedInDays: 14 },
        ctx
      );
      jobs.push(...liJobs);
    } catch (e) {
      errors.push(`${company.name} (LinkedIn): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return jobs;
}

export async function runScrapeSweep(): Promise<SweepResult> {
  const ctx: ScrapeContext = {
    linkedinLiAt: await getSetting(SETTING_KEYS.linkedinLiAt),
  };
  const errors: string[] = [];

  const [companies, profiles] = await Promise.all([
    prisma.company.findMany({ where: { active: true } }),
    prisma.positionProfile.findMany({ where: { active: true } }),
  ]);

  const collected: ScrapedJob[] = [];

  // 1) Watchlist companies
  for (const company of companies) {
    collected.push(...(await scrapeCompany(company, ctx, errors)));
  }

  // 2) Profile-driven LinkedIn searches (keywords + locations)
  for (const profile of profiles) {
    const keywordQuery = [...profile.titleKeywords, ...profile.keywords]
      .slice(0, 4)
      .join(" ");
    if (!keywordQuery) continue;
    const locations = profile.locations.length > 0 ? profile.locations : [""];
    for (const location of locations.slice(0, 3)) {
      try {
        const found = await searchLinkedinJobs(
          { keywords: keywordQuery, location: location || undefined, postedInDays: 7, remote: profile.remoteOk && !location },
          ctx
        );
        collected.push(...found);
      } catch (e) {
        errors.push(`profile "${profile.name}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Enrich LinkedIn jobs (they arrive without descriptions) so scoring has text.
  const needsEnrichment = collected.filter((j) => j.source === "LINKEDIN" && !j.description);
  await enrichDescriptions(needsEnrichment, ctx, 40);

  // Upsert into the database
  const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c.id]));
  let newJobs = 0;
  const upsertedIds: string[] = [];
  const seenKeys = new Set<string>();

  for (const job of collected) {
    const dedupeKey = dedupeKeyFor(job.source, job.externalId, job.url);
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    const companyId = companyByName.get(job.companyName.toLowerCase()) ?? null;
    const existing = await prisma.job.findUnique({ where: { dedupeKey } });
    if (existing) {
      upsertedIds.push(existing.id);
      // Backfill description if we have one now and didn't before
      if (!existing.description && job.description) {
        await prisma.job.update({
          where: { id: existing.id },
          data: { description: job.description },
        });
      }
      continue;
    }
    const created = await prisma.job.create({
      data: {
        dedupeKey,
        source: job.source,
        externalId: job.externalId,
        url: job.url,
        title: job.title.slice(0, 500),
        companyName: job.companyName.slice(0, 300),
        companyId,
        location: job.location.slice(0, 300),
        description: job.description,
        postedAt: job.postedAt,
      },
    });
    newJobs++;
    upsertedIds.push(created.id);
  }

  // Score all touched jobs against all active profiles
  const { newMatches, newMatchSummaries } = await scoreJobs(upsertedIds, profiles);

  return { jobsFound: collected.length, newJobs, newMatches, errors, newMatchSummaries };
}

export async function scoreJobs(
  jobIds: string[],
  profiles: Awaited<ReturnType<typeof prisma.positionProfile.findMany>>
): Promise<{ newMatches: number; newMatchSummaries: SweepResult["newMatchSummaries"] }> {
  let newMatches = 0;
  const newMatchSummaries: SweepResult["newMatchSummaries"] = [];
  if (jobIds.length === 0 || profiles.length === 0) {
    return { newMatches, newMatchSummaries };
  }

  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } } });
  for (const job of jobs) {
    for (const profile of profiles) {
      const result = scoreJob(
        { title: job.title, description: job.description, location: job.location },
        {
          keywords: profile.keywords,
          titleKeywords: profile.titleKeywords,
          excludeKeywords: profile.excludeKeywords,
          locations: profile.locations,
          remoteOk: profile.remoteOk,
          minScore: profile.minScore,
        }
      );
      if (!result.suggested) continue;
      const existing = await prisma.match.findUnique({
        where: { jobId_profileId: { jobId: job.id, profileId: profile.id } },
      });
      if (existing) continue;
      await prisma.match.create({
        data: {
          jobId: job.id,
          profileId: profile.id,
          score: result.score,
          matchedKeywords: result.matchedKeywords,
        },
      });
      newMatches++;
      newMatchSummaries.push({
        title: job.title,
        company: job.companyName,
        score: result.score,
        url: job.url,
      });
    }
  }
  return { newMatches, newMatchSummaries };
}

/** Re-score every job that has no match yet (used after profile edits). */
export async function rescoreAllJobs(): Promise<number> {
  const profiles = await prisma.positionProfile.findMany({ where: { active: true } });
  const jobs = await prisma.job.findMany({ select: { id: true } });
  const { newMatches } = await scoreJobs(
    jobs.map((j) => j.id),
    profiles
  );
  return newMatches;
}
