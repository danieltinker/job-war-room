/** Greenhouse public board API — stable JSON, no auth. */
import { stripHtml } from "@/core/normalize";
import type { ScrapedJob } from "./types";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  content?: string;
}

export async function scrapeGreenhouse(
  boardToken: string,
  companyName: string
): Promise<ScrapedJob[]> {
  const base = process.env.GREENHOUSE_API_BASE ?? "https://boards-api.greenhouse.io";
  const res = await fetch(
    `${base}/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    { headers: { accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Greenhouse ${boardToken}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: GhJob[] };
  return (data.jobs ?? []).map((j) => ({
    source: "GREENHOUSE" as const,
    externalId: String(j.id),
    url: j.absolute_url,
    title: j.title,
    companyName,
    location: j.location?.name ?? "",
    description: stripHtml(j.content ?? "").slice(0, 20000),
    postedAt: j.first_published
      ? new Date(j.first_published)
      : j.updated_at
        ? new Date(j.updated_at)
        : null,
  }));
}
