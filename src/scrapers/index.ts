/**
 * Scrape orchestrator: runs one full sweep —
 *   1. every active watchlist company (ATS board, careers page, LinkedIn),
 *   2. every active position profile as a LinkedIn keyword search,
 * then upserts jobs, scores them against profiles, and records matches.
 *
 * Every scrape attempt is recorded as a SweepSource row (status, jobs found,
 * error, duration) so the dashboard can show exactly what happened — nothing
 * fails silently.
 */
import { prisma } from "@/lib/db";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { scoreJob } from "@/core/matching";
import { dedupeKeyFor } from "@/core/normalize";
import { scrapeGreenhouse } from "./greenhouse";
import { scrapeLever } from "./lever";
import { scrapeAshby } from "./ashby";
import { scrapeSmartrecruiters } from "./smartrecruiters";
import { scrapeCareersPage, scrapeComeet } from "./careers";
import { searchLinkedinJobs, enrichDescriptions } from "./linkedin";
import type { ScrapedJob, ScrapeContext } from "./types";
import type { PositionProfile, Prisma } from "@prisma/client";

export interface SweepResult {
  jobsFound: number;
  newJobs: number;
  newMatches: number;
  companiesScanned: number;
  queriesRun: number;
  jobsScored: number;
  errors: string[];
  newMatchSummaries: { title: string; company: string; score: number; url: string }[];
}

/** Runs one scrape attempt, times it, and records a SweepSource row. */
async function recordSource(
  runId: string | null,
  kind: string,
  label: string,
  fn: () => Promise<{ jobs: ScrapedJob[]; error?: string | null }>
): Promise<{ jobs: ScrapedJob[]; error: string | null }> {
  const startedAt = Date.now();
  let jobs: ScrapedJob[] = [];
  let error: string | null = null;
  try {
    const out = await fn();
    jobs = out.jobs;
    error = out.error ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (runId) {
    await prisma.sweepSource.create({
      data: {
        runId,
        kind,
        label: label.slice(0, 300),
        status: error ? "FAILED" : jobs.length > 0 ? "OK" : "EMPTY",
        jobsFound: jobs.length,
        error: (error ?? "").slice(0, 1000),
        durationMs: Date.now() - startedAt,
      },
    });
  }
  return { jobs, error };
}

export async function runScrapeSweep(runId: string | null = null): Promise<SweepResult> {
  const ctx: ScrapeContext = {
    linkedinLiAt: await getSetting(SETTING_KEYS.linkedinLiAt),
  };
  const errors: string[] = [];
  let queriesRun = 0;

  const [companies, profiles] = await Promise.all([
    prisma.company.findMany({ where: { active: true } }),
    prisma.positionProfile.findMany({ where: { active: true } }),
  ]);

  const collected: ScrapedJob[] = [];
  const note = (label: string, error: string | null) => {
    if (error) errors.push(`${label}: ${error}`);
  };

  // ── 1) Watchlist companies ────────────────────────────────────────────
  for (const company of companies) {
    // Structured ATS board (most reliable)
    if (company.ats !== "NONE" && company.atsIdentifier) {
      queriesRun++;
      const label = `${company.name} (${company.ats.toLowerCase()}: ${company.atsIdentifier})`;
      const { jobs, error } = await recordSource(runId, "ats", label, async () => {
        switch (company.ats) {
          case "GREENHOUSE":
            return { jobs: await scrapeGreenhouse(company.atsIdentifier, company.name) };
          case "LEVER":
            return { jobs: await scrapeLever(company.atsIdentifier, company.name) };
          case "ASHBY":
            return { jobs: await scrapeAshby(company.atsIdentifier, company.name) };
          case "SMARTRECRUITERS":
            return { jobs: await scrapeSmartrecruiters(company.atsIdentifier, company.name) };
          case "COMEET":
            return { jobs: await scrapeComeet(company.atsIdentifier, company.name) };
          default:
            return { jobs: [] };
        }
      });
      collected.push(...jobs);
      note(label, error);
    }

    // Direct careers page (auto-detects embedded boards)
    if (company.careersUrl) {
      queriesRun++;
      const label = `${company.name} (careers page)`;
      const { jobs, error } = await recordSource(runId, "careers", label, async () => ({
        jobs: await scrapeCareersPage(company.careersUrl, company.name),
      }));
      collected.push(...jobs);
      note(label, error);
    }

    // LinkedIn company sweep
    queriesRun++;
    const liLabel = `${company.name} (linkedin search)`;
    const { jobs: liJobs, error: liError } = await recordSource(
      runId,
      "linkedin-company",
      liLabel,
      async () => {
        const result = await searchLinkedinJobs(
          { keywords: company.name, companyName: company.name, postedInDays: 14, maxPages: 2 },
          ctx
        );
        return { jobs: result.jobs, error: result.error };
      }
    );
    collected.push(...liJobs);
    note(liLabel, liError);
  }

  // ── 2) Profile-driven LinkedIn searches ───────────────────────────────
  for (const profile of profiles) {
    const keywordQuery = [...profile.titleKeywords, ...profile.keywords].slice(0, 4).join(" ");
    if (!keywordQuery) continue;
    const locations = profile.locations.length > 0 ? profile.locations : [""];
    for (const location of locations.slice(0, 3)) {
      queriesRun++;
      const label = `profile: ${profile.name}${location ? ` @ ${location}` : " (anywhere)"}`;
      const { jobs, error } = await recordSource(runId, "linkedin-profile", label, async () => {
        const result = await searchLinkedinJobs(
          {
            keywords: keywordQuery,
            location: location || undefined,
            postedInDays: 7,
            remote: profile.remoteOk && !location,
          },
          ctx
        );
        return { jobs: result.jobs, error: result.error };
      });
      collected.push(...jobs);
      note(label, error);
    }
  }

  // Enrich LinkedIn jobs (they arrive without descriptions) so scoring has text.
  const needsEnrichment = collected.filter((j) => j.source === "LINKEDIN" && !j.description);
  await enrichDescriptions(needsEnrichment, ctx, 40);

  // ── Upsert into the database ──────────────────────────────────────────
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

  // ── Score all touched jobs against all active profiles ────────────────
  const { newMatches, newMatchSummaries, jobsScored } = await scoreJobs(upsertedIds, profiles);

  return {
    jobsFound: collected.length,
    newJobs,
    newMatches,
    companiesScanned: companies.length,
    queriesRun,
    jobsScored,
    errors,
    newMatchSummaries,
  };
}

export async function scoreJobs(
  jobIds: string[],
  profiles: PositionProfile[]
): Promise<{
  newMatches: number;
  newMatchSummaries: SweepResult["newMatchSummaries"];
  jobsScored: number;
}> {
  let newMatches = 0;
  const newMatchSummaries: SweepResult["newMatchSummaries"] = [];
  if (jobIds.length === 0 || profiles.length === 0) {
    return { newMatches, newMatchSummaries, jobsScored: 0 };
  }

  const globalExcludesRaw = (await getSetting(SETTING_KEYS.globalTitleExcludes)) ?? "";
  const globalTitleExcludes = globalExcludesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } } });
  for (const job of jobs) {
    // Full breakdown per profile — persisted so the UI can explain every score.
    const detail: { profile: string; score: number; matched: string[]; reason: string }[] = [];
    let bestScore = 0;

    for (const profile of profiles) {
      const result = scoreJob(
        { title: job.title, description: job.description, location: job.location },
        {
          keywords: profile.keywords,
          titleKeywords: profile.titleKeywords,
          excludeKeywords: profile.excludeKeywords,
          titleExcludes: globalTitleExcludes,
          locations: profile.locations,
          remoteOk: profile.remoteOk,
          minScore: profile.minScore,
        }
      );
      detail.push({
        profile: profile.name,
        score: result.score,
        matched: result.matchedKeywords,
        reason: result.reason,
      });
      if (result.score > bestScore) bestScore = result.score;
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

    await prisma.job.update({
      where: { id: job.id },
      data: {
        bestScore,
        scoreDetail: detail.sort((a, b) => b.score - a.score) as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return { newMatches, newMatchSummaries, jobsScored: jobs.length };
}

/** Re-score every job (used after profile edits). */
export async function rescoreAllJobs(): Promise<number> {
  const profiles = await prisma.positionProfile.findMany({ where: { active: true } });
  const jobs = await prisma.job.findMany({ select: { id: true } });
  const { newMatches } = await scoreJobs(
    jobs.map((j) => j.id),
    profiles
  );
  return newMatches;
}
