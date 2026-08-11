/** Ashby public job board API — stable JSON, no auth. */
import type { ScrapedJob } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  isRemote?: boolean;
}

export async function scrapeAshby(orgSlug: string, companyName: string): Promise<ScrapedJob[]> {
  const base = process.env.ASHBY_API_BASE ?? "https://api.ashbyhq.com";
  const res = await fetch(
    `${base}/posting-api/job-board/${encodeURIComponent(orgSlug)}?includeCompensation=false`,
    { headers: { accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Ashby ${orgSlug}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  return (data.jobs ?? []).map((j) => ({
    source: "ASHBY" as const,
    externalId: j.id,
    url: j.jobUrl ?? j.applyUrl ?? `https://jobs.ashbyhq.com/${orgSlug}/${j.id}`,
    title: j.title,
    companyName,
    location: [j.location, j.isRemote ? "Remote" : ""].filter(Boolean).join(" · "),
    description: (j.descriptionPlain ?? "").slice(0, 20000),
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
  }));
}
