/**
 * LinkedIn job scraper.
 *
 * Primary strategy: the public "jobs-guest" HTML endpoint that powers
 * LinkedIn's logged-out job search. It requires no authentication and returns
 * job cards as HTML fragments. When the user has stored their `li_at` cookie
 * (Settings → LinkedIn), it is attached to improve reliability/rate limits.
 *
 * Be a polite guest: requests are throttled, retried with backoff, and capped
 * per run. This is intended for personal, low-volume use on the user's own
 * behalf — not bulk harvesting.
 */
import * as cheerio from "cheerio";
import { stripHtml } from "@/core/normalize";
import type { ScrapedJob, ScrapeContext } from "./types";

const LINKEDIN_BASE = process.env.LINKEDIN_BASE ?? "https://www.linkedin.com";
const GUEST_SEARCH = `${LINKEDIN_BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search`;
const PAGE_SIZE = 25;
const MAX_PAGES = 4; // up to 100 results per query
const THROTTLE_MS = 2500;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, ctx: ScrapeContext, attempts = 3): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          "accept-language": "en-US,en;q=0.9",
          ...(ctx.linkedinLiAt ? { cookie: `li_at=${ctx.linkedinLiAt}` } : {}),
        },
        redirect: "follow",
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(4000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch {
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

function parseJobCards(html: string): ScrapedJob[] {
  const $ = cheerio.load(html);
  const jobs: ScrapedJob[] = [];
  $("li").each((_, el) => {
    const card = $(el);
    const link = card.find("a.base-card__full-link, a[href*='/jobs/view/']").first();
    const href = link.attr("href") ?? "";
    if (!href) return;
    const title =
      card.find(".base-search-card__title").text().trim() || link.text().trim();
    const companyName = card.find(".base-search-card__subtitle").text().trim();
    const location = card.find(".job-search-card__location").text().trim();
    const dateAttr = card.find("time").attr("datetime") ?? "";
    // urn like urn:li:jobPosting:3948... appears in data-entity-urn
    const urn =
      card.find("[data-entity-urn]").attr("data-entity-urn") ??
      card.attr("data-entity-urn") ??
      "";
    const idFromUrn = urn.split(":").pop() ?? "";
    const idFromHref = href.match(/-(\d{6,})(?:\?|$)/)?.[1] ?? "";
    const externalId = idFromUrn || idFromHref;
    if (!title || !externalId) return;
    jobs.push({
      source: "LINKEDIN",
      externalId,
      url: `https://www.linkedin.com/jobs/view/${externalId}`,
      title,
      companyName,
      location,
      description: "",
      postedAt: dateAttr ? new Date(dateAttr) : null,
    });
  });
  return jobs;
}

export interface LinkedinQuery {
  keywords: string;
  location?: string; // e.g. "Israel", "Tel Aviv"
  companyName?: string; // filter client-side by company
  remote?: boolean;
  postedInDays?: number; // f_TPR filter
}

/** Search LinkedIn jobs (logged-out guest endpoint, paginated). */
export async function searchLinkedinJobs(
  query: LinkedinQuery,
  ctx: ScrapeContext
): Promise<ScrapedJob[]> {
  const all: ScrapedJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      keywords: query.keywords,
      start: String(page * PAGE_SIZE),
    });
    if (query.location) params.set("location", query.location);
    if (query.postedInDays) params.set("f_TPR", `r${query.postedInDays * 86400}`);
    if (query.remote) params.set("f_WT", "2");

    const html = await fetchWithRetry(`${GUEST_SEARCH}?${params}`, ctx);
    if (!html) break;
    const batch = parseJobCards(html);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    await sleep(THROTTLE_MS);
  }

  const filtered = query.companyName
    ? all.filter((j) =>
        j.companyName.toLowerCase().includes(query.companyName!.toLowerCase())
      )
    : all;

  // Dedupe by externalId within the run
  const seen = new Set<string>();
  return filtered.filter((j) => {
    if (seen.has(j.externalId)) return false;
    seen.add(j.externalId);
    return true;
  });
}

/** Fetch the full description for a single job posting (guest endpoint). */
export async function fetchLinkedinJobDescription(
  externalId: string,
  ctx: ScrapeContext
): Promise<string> {
  const html = await fetchWithRetry(
    `${LINKEDIN_BASE}/jobs-guest/jobs/api/jobPosting/${externalId}`,
    ctx
  );
  if (!html) return "";
  const $ = cheerio.load(html);
  const desc = $(".show-more-less-html__markup").html() ?? "";
  return stripHtml(desc).slice(0, 20000);
}

/** Enrich up to `limit` jobs with full descriptions (throttled). */
export async function enrichDescriptions(
  jobs: ScrapedJob[],
  ctx: ScrapeContext,
  limit = 25
): Promise<void> {
  let done = 0;
  for (const job of jobs) {
    if (done >= limit) break;
    if (job.description) continue;
    job.description = await fetchLinkedinJobDescription(job.externalId, ctx);
    done++;
    await sleep(THROTTLE_MS);
  }
}
