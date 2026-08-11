/** Lever public postings API — stable JSON, no auth. */
import { stripHtml } from "@/core/normalize";
import type { ScrapedJob } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  description?: string;
}

export async function scrapeLever(site: string, companyName: string): Promise<ScrapedJob[]> {
  const base = process.env.LEVER_API_BASE ?? "https://api.lever.co";
  const res = await fetch(
    `${base}/v0/postings/${encodeURIComponent(site)}?mode=json`,
    { headers: { accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Lever ${site}: HTTP ${res.status}`);
  const data = (await res.json()) as LeverPosting[];
  return data.map((p) => ({
    source: "LEVER" as const,
    externalId: p.id,
    url: p.hostedUrl,
    title: p.text,
    companyName,
    location: p.categories?.location ?? "",
    description: (p.descriptionPlain ?? stripHtml(p.description ?? "")).slice(0, 20000),
    postedAt: p.createdAt ? new Date(p.createdAt) : null,
  }));
}
