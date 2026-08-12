/** SmartRecruiters public postings API — stable JSON, no auth. */
import { stripHtml } from "@/core/normalize";
import type { ScrapedJob } from "./types";

const DETAIL_FETCH_CAP = 30; // per run; existing jobs are skipped by the upsert anyway
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
}

interface SrDetail {
  jobAd?: {
    sections?: Record<string, { title?: string; text?: string } | undefined>;
  };
  applyUrl?: string;
  postingUrl?: string;
}

function base(): string {
  return process.env.SMARTRECRUITERS_API_BASE ?? "https://api.smartrecruiters.com";
}

function locationOf(p: SrPosting): string {
  const parts = [p.location?.city, p.location?.region, p.location?.country?.toUpperCase()]
    .filter(Boolean)
    .join(", ");
  return p.location?.remote ? [parts, "Remote"].filter(Boolean).join(" · ") : parts;
}

async function fetchDescription(companyId: string, postingId: string): Promise<string> {
  try {
    const res = await fetch(
      `${base()}/v1/companies/${encodeURIComponent(companyId)}/postings/${encodeURIComponent(postingId)}`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) return "";
    const detail = (await res.json()) as SrDetail;
    const sections = detail.jobAd?.sections ?? {};
    const text = Object.values(sections)
      .map((s) => s?.text ?? "")
      .filter(Boolean)
      .join("\n");
    return stripHtml(text).slice(0, 20000);
  } catch {
    return "";
  }
}

export async function scrapeSmartrecruiters(
  companyId: string,
  companyName: string
): Promise<ScrapedJob[]> {
  const postings: SrPosting[] = [];
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const res = await fetch(
      `${base()}/v1/companies/${encodeURIComponent(companyId)}/postings?limit=100&offset=${offset}`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`SmartRecruiters ${companyId}: HTTP ${res.status}`);
    const data = (await res.json()) as { totalFound?: number; content?: SrPosting[] };
    const batch = data.content ?? [];
    postings.push(...batch);
    offset += batch.length;
    if (batch.length < 100 || offset >= (data.totalFound ?? 0)) break;
  }

  const jobs: ScrapedJob[] = postings.map((p) => ({
    source: "SMARTRECRUITERS" as const,
    externalId: p.id,
    url: `https://jobs.smartrecruiters.com/${companyId}/${p.id}`,
    title: p.name,
    companyName,
    location: locationOf(p),
    description: "",
    postedAt: p.releasedDate ? new Date(p.releasedDate) : null,
  }));

  // The list endpoint has no descriptions; enrich a bounded number per run.
  let fetched = 0;
  for (const job of jobs) {
    if (fetched >= DETAIL_FETCH_CAP) break;
    job.description = await fetchDescription(companyId, job.externalId);
    fetched++;
    await sleep(250);
  }
  return jobs;
}
